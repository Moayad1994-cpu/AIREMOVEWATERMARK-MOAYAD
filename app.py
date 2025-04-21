import os
import cv2 # OpenCV for image processing
import numpy as np
from flask import Flask, render_template, request, jsonify, url_for, send_from_directory
import base64 # To encode/decode image data
import io # To handle image bytes
import datetime # For current year in footer
import json # For potential future use (not directly for mask now)
import tempfile # For handling temporary video files
import uuid # For unique filenames
import mimetypes # To guess file type
import traceback # For detailed error logging

app = Flask(__name__)

# --- Configuration ---
OUTPUT_FOLDER = os.path.join('static', 'output')
app.config['OUTPUT_FOLDER'] = OUTPUT_FOLDER
os.makedirs(app.config['OUTPUT_FOLDER'], exist_ok=True)

# --- Helper Function - Image Removal using Mask Image ---
def attempt_image_object_removal_with_mask(image_bytes, mask_bytes=None):
    """ Uses INPAINT_TELEA with minimum radius (1) using a provided mask image """
    processing_info = "Local OpenCV Img Processing"
    final_status_message = ""
    try:
        nparr_img = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr_img, cv2.IMREAD_COLOR)
        if img is None: raise ValueError("Could not decode input image.")
        img_h, img_w = img.shape[:2]

        mask = None
        mask_applied = False
        if mask_bytes:
            try:
                nparr_mask = np.frombuffer(mask_bytes, np.uint8)
                decoded_mask = cv2.imdecode(nparr_mask, cv2.IMREAD_GRAYSCALE)
                if decoded_mask is None: print("Warning: Could not decode received mask data.")
                else:
                    if decoded_mask.shape[0]!=img_h or decoded_mask.shape[1]!=img_w:
                        print(f"Warning: Resizing mask from {decoded_mask.shape} to {img.shape[:2]}")
                        mask = cv2.resize(decoded_mask, (img_w, img_h), interpolation=cv2.INTER_NEAREST)
                    else: mask = decoded_mask
                    _, mask = cv2.threshold(mask, 1, 255, cv2.THRESH_BINARY) # Ensure binary
                    if np.sum(mask) > 0: # Check if mask has white pixels
                       processing_info = "Local OpenCV Img Inpainting (Brush/Shape Mask TELEA, Radius 1)"
                       mask_applied = True
                    else:
                        print("Warning: Provided mask was empty (all black).")
                        mask = None # Treat as no mask
            except Exception as mask_err: print(f"Error processing provided mask: {mask_err}"); mask = None

        if not mask_applied:
            print("Warning: No valid mask provided/used. Returning original image.")
            inpainted_img = img; processing_info = "No Valid Mask Provided/Used - Original Img Returned"
            final_status_message = f"Processing skipped ({processing_info})."
        else:
            print(f"Applying provided mask using INPAINT_TELEA with radius 1.")
            inpainted_img = cv2.inpaint(img, mask, inpaintRadius=5, flags=cv2.INPAINT_TELEA); # Radius 5
            if inpainted_img is None: raise ValueError("Inpainting failed.")
            final_status_message = f"Img Processing complete ({processing_info}). Artifacts may be present."

        is_success, buffer = cv2.imencode(".png", inpainted_img)
        if not is_success: raise ValueError("Could not encode processed image.")
        return buffer.tobytes(), final_status_message
    except Exception as e:
        print(f"Error during image processing: {e}"); traceback.print_exc()
        return image_bytes, f"Error processing image: {e}. Returning original."

# --- Helper Function - Video Removal using Mask Image ---
def attempt_video_object_removal_with_mask(video_path, output_path, mask_bytes=None):
    """ Uses INPAINT_TELEA with minimum radius (1) using a provided static mask image """
    processing_info = "Local OpenCV Vid Processing (Static Mask)"
    final_status_message = ""
    cap = None; writer = None
    try:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened(): raise ValueError(f"Could not open video file: {video_path}")
        fps = cap.get(cv2.CAP_PROP_FPS); frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)); frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        if not (fps > 0 and frame_width > 0 and frame_height > 0): raise ValueError(f"Invalid video properties read: {frame_width}x{frame_height} @ {fps}")
        print(f"Input video: {frame_width}x{frame_height} @ {fps:.2f} FPS")

        mask = None
        mask_applied = False
        if mask_bytes:
             try:
                 nparr_mask = np.frombuffer(mask_bytes, np.uint8); decoded_mask = cv2.imdecode(nparr_mask, cv2.IMREAD_GRAYSCALE)
                 if decoded_mask is not None:
                     if decoded_mask.shape[0]!=frame_height or decoded_mask.shape[1]!=frame_width:
                         print(f"Resizing video mask from {decoded_mask.shape} to {(frame_height, frame_width)}")
                         mask = cv2.resize(decoded_mask, (frame_width, frame_height), interpolation=cv2.INTER_NEAREST)
                     else: mask = decoded_mask
                     _, mask = cv2.threshold(mask, 1, 255, cv2.THRESH_BINARY)
                     if np.sum(mask) > 0:
                         processing_info = "Local OpenCV Vid Inpainting (Static Brush/Shape Mask TELEA, Radius 1)"
                         mask_applied = True
                     else: print("Warning: Video mask was empty."); mask = None
                 else: print("Warning: Could not decode mask for video.")
             except Exception as mask_err: print(f"Error processing mask for video: {mask_err}")

        if not mask_applied:
            print("Warning: No valid mask for video."); processing_info = "No Valid Mask Provided - Original Vid Returned"
            mask = np.zeros((frame_height, frame_width), dtype=np.uint8) # Ensure mask exists but is empty

        fourcc = cv2.VideoWriter_fourcc(*'mp4v'); writer = cv2.VideoWriter(output_path, fourcc, fps, (frame_width, frame_height))
        if not writer.isOpened(): raise ValueError(f"Could not open video writer for {output_path}")
        print(f"Processing video frames... Mask Applied: {mask_applied}. Output: {output_path}")
        processed_frame_count = 0
        while True:
            ret, frame = cap.read();
            if not ret: break
            processed_frame = cv2.inpaint(frame, mask, inpaintRadius=5, flags=cv2.INPAINT_TELEA) # Radius 5
            writer.write(processed_frame); processed_frame_count += 1
            if processed_frame_count % 60 == 0: print(f"Processed {processed_frame_count} frames...")
        print(f"Finished video. Frames written: {processed_frame_count}")
        final_status_message = f"Video processing complete ({processing_info}). Artifacts highly likely."
        return final_status_message
    except Exception as e: print(f"Error during video processing: {e}"); traceback.print_exc(); raise e # Re-raise after logging
    finally:
        if cap is not None and cap.isOpened(): cap.release()
        if writer is not None and writer.isOpened(): writer.release()

# --- Routes ---
@app.route('/')
def index():
    current_year = datetime.datetime.now().year
    return render_template('index.html', current_year=current_year)

@app.route('/output/<path:filename>') # Use path converter for safety
def output_file(filename):
    # IMPORTANT: Basic check to prevent serving files outside the intended directory
    # In a production environment, use more robust methods like checking against a database
    # or ensuring the filename doesn't contain '..' etc.
    safe_path = os.path.abspath(os.path.join(app.config['OUTPUT_FOLDER'], filename))
    if not safe_path.startswith(os.path.abspath(app.config['OUTPUT_FOLDER'])):
        print(f"Forbidden path request: {filename}")
        return jsonify({"error": "Forbidden"}), 403

    print(f"Serving file request: {filename}")
    try:
        return send_from_directory(app.config['OUTPUT_FOLDER'], filename, as_attachment=False)
    except FileNotFoundError:
        print(f"File not found: {filename}")
        return jsonify({"error": "File not found"}), 404

@app.route('/api/process', methods=['POST'])
def process_data():
    if 'image_file' not in request.files: return jsonify({"error": "No file part."}), 400
    file = request.files['image_file']
    if file.filename == '': return jsonify({"error": "No selected file."}), 400
    if not file: return jsonify({"error": "Invalid file."}), 400
    mime_type, _ = mimetypes.guess_type(file.filename); is_video = mime_type and mime_type.startswith('video'); is_image = mime_type and mime_type.startswith('image')
    if not is_video and not is_image: return jsonify({"error": f"Unsupported type: {mime_type or 'Unknown'}."}), 415

    mask_bytes = None
    try:
        mask_data_uri = request.form.get('mask_data', None)
        if mask_data_uri and mask_data_uri.startswith('data:image/png;base64,'):
            base64_string = mask_data_uri.split(',', maxsplit=1)[1]; mask_bytes = base64.b64decode(base64_string)
            print(f"Received mask data ({len(mask_bytes)} bytes).")
        else: print("Warn: No valid 'mask_data' field received.")
    except Exception as e: print(f"Error processing mask data: {e}"); mask_bytes = None

    try:
        api_result = {}; status_message = "Processing init failed."
        if is_image:
            image_bytes = file.read()
            processed_bytes, status_message = attempt_image_object_removal_with_mask(image_bytes, mask_bytes)
            encoded_image = base64.b64encode(processed_bytes).decode('utf-8')
            api_result["result_image_data"] = f"data:image/png;base64,{encoded_image}"
        elif is_video:
            temp_video_path = None; output_filename = None; # Define before try
            try:
                temp_suffix = os.path.splitext(file.filename)[1] or '.tmp'
                # Use 'with' statement for automatic closing
                with tempfile.NamedTemporaryFile(delete=False, suffix=temp_suffix) as temp_video:
                    file.save(temp_video.name); temp_video_path = temp_video.name
                print(f"Temp video saved: {temp_video_path}")
                output_filename = f"{uuid.uuid4()}.mp4"; output_path = os.path.join(app.config['OUTPUT_FOLDER'], output_filename)
                status_message = attempt_video_object_removal_with_mask(temp_video_path, output_path, mask_bytes)
                # Generate relative URL, let browser handle base path
                video_url = url_for('output_file', filename=output_filename)
                api_result["result_video_url"] = video_url
                api_result["result_filename"] = output_filename
            except Exception as video_err: # Catch errors during video processing specifically
                 status_message = f"Error during video processing: {video_err}. Check server logs."
                 print(f"Video Processing Error: {video_err}"); traceback.print_exc()
                 # Ensure output path is cleaned up if writer failed before completion
                 if output_filename and os.path.exists(os.path.join(app.config['OUTPUT_FOLDER'], output_filename)):
                     try: os.remove(os.path.join(app.config['OUTPUT_FOLDER'], output_filename)); print(f"Removed failed output: {output_filename}")
                     except OSError as e: print(f"Error removing failed output {output_filename}: {e}")
            finally:
                 if temp_video_path and os.path.exists(temp_video_path):
                     try: os.remove(temp_video_path); print(f"Removed temp video: {temp_video_path}")
                     except OSError as e: print(f"Error removing temp video {temp_video_path}: {e}")

        # Common Response
        api_result["status"] = "warning" if "Error" in status_message or "Original" in status_message else "success"
        api_result["message"] = status_message
        processing_method_detail = "Local OpenCV Inpainting (Brush/Shape Mask TELEA, Radius 1)" if mask_bytes else "Local OpenCV Processing (No Mask/Original)"
        if "Original Img Returned" in status_message: processing_method_detail = "Local OpenCV Processing (Img No Valid Mask/Original)"
        elif "Original Vid Returned" in status_message: processing_method_detail = "Local OpenCV Processing (Vid No Valid Mask/Original)"

        api_result["details"] = { "processing_method": processing_method_detail, "input_filename": file.filename, "is_video": is_video, "disclaimer": "Radius=1 used. Quality varies. Artifacts very likely." }
        return jsonify(api_result), 200
    except Exception as e:
         print(f"Error processing file route: {e}"); traceback.print_exc()
         return jsonify({"error": f"Unexpected server error processing file."}), 500

# --- Run ---
if __name__ == '__main__':
    # Set debug=False for production deployment
    app.run(debug=True, host='0.0.0.0', port=5000)