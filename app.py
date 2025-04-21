import os
import cv2  # OpenCV for image/video processing
import numpy as np
from flask import Flask, render_template, request, jsonify, url_for, send_from_directory
import base64  # To encode/decode image data for display/mask
import datetime  # For current year in footer
import tempfile  # For handling temporary files securely
import uuid  # For unique output filenames
import mimetypes  # To guess file type based on extension
import traceback  # For detailed error logging

# --- Flask App Setup ---
app = Flask(__name__)

# --- Configuration ---
OUTPUT_FOLDER = os.path.join('static', 'output')
# Max file size: 100 MB (100 * 1024 * 1024 bytes)
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024
app.config['OUTPUT_FOLDER'] = OUTPUT_FOLDER

# Create output directory if it doesn't exist
os.makedirs(app.config['OUTPUT_FOLDER'], exist_ok=True)
print(f"[*] Output folder configured at: {os.path.abspath(app.config['OUTPUT_FOLDER'])}")
print(f"[*] Max upload size set to: {app.config['MAX_CONTENT_LENGTH'] / (1024*1024):.0f} MB")
print("[!] IMPORTANT: If using Nginx/Apache, ensure 'client_max_body_size' (or equivalent) is also set!")

# --- Image Processing Helper ---
def attempt_image_object_removal_with_mask(image_bytes, mask_bytes=None, blur_amount=0):
    """
    Processes an image: applies inpainting based on a mask, then optionally blurs.

    Args:
        image_bytes (bytes): Raw bytes of the input image.
        mask_bytes (bytes, optional): Raw bytes of the PNG mask image. Defaults to None.
        blur_amount (int, optional): Blur level (0-50). 0 means no blur. Defaults to 0.

    Returns:
        tuple: (processed_image_bytes, status_message, processing_info_string)
               Returns original image bytes on error.
    """
    processing_info = "Local OpenCV Image Processing"
    final_status_message = ""
    processed_img_bytes = image_bytes # Default to original on error
    try:
        # 1. Decode Input Image
        nparr_img = np.frombuffer(image_bytes, np.uint8)
        img_original = cv2.imdecode(nparr_img, cv2.IMREAD_COLOR)
        if img_original is None:
            raise ValueError("Could not decode input image data.")
        img_h, img_w = img_original.shape[:2]
        img_processed = img_original.copy() # Work on a copy
        print(f"[IMG] Decoded input image: {img_w}x{img_h}")

        # 2. Load and Validate Mask
        mask = None
        mask_applied = False
        if mask_bytes:
            try:
                nparr_mask = np.frombuffer(mask_bytes, np.uint8)
                decoded_mask = cv2.imdecode(nparr_mask, cv2.IMREAD_GRAYSCALE)
                if decoded_mask is None:
                    print("[IMG WARN] Could not decode received mask data.")
                else:
                    # Resize mask if needed
                    if decoded_mask.shape[0] != img_h or decoded_mask.shape[1] != img_w:
                        print(f"[IMG WARN] Resizing mask from {decoded_mask.shape} to {(img_h, img_w)}")
                        mask = cv2.resize(decoded_mask, (img_w, img_h), interpolation=cv2.INTER_NEAREST)
                    else:
                        mask = decoded_mask
                    # Ensure mask is binary (0 or 255)
                    _, mask = cv2.threshold(mask, 127, 255, cv2.THRESH_BINARY) # Use 127 threshold for safety
                    # Check if mask contains anything to inpaint
                    if np.sum(mask > 0) > 0:
                       mask_applied = True
                       print("[IMG] Valid mask loaded.")
                    else:
                        print("[IMG WARN] Provided mask was empty (all black). No inpainting needed.")
                        mask = None # Treat as no mask provided
            except Exception as mask_err:
                print(f"[IMG ERROR] Error processing provided mask: {mask_err}")
                traceback.print_exc()
                mask = None # Ensure mask is None on error

        # 3. Perform Inpainting (if mask is valid)
        if mask_applied and mask is not None:
            print(f"[IMG] Applying inpainting (TELEA, Radius 5)...")
            inpainted_img = cv2.inpaint(img_original, mask, inpaintRadius=9, flags=cv2.INPAINT_TELEA)
            if inpainted_img is None:
                raise ValueError("Inpainting function failed (returned None).")
            img_processed = inpainted_img
            processing_info = "Inpainting (TELEA, R5)"
            final_status_message = "Image inpainting complete. "
        else:
            processing_info = "No Mask / Skipped Inpainting"
            final_status_message = "No valid mask provided; inpainting skipped. "
            if mask_bytes: # A mask was sent but was invalid/empty
                 final_status_message = "Invalid/Empty mask provided; inpainting skipped. "


        # 4. Apply Optional Blur
        blur_kernel_size = 0
        if blur_amount > 0:
            # Kernel size must be odd
            blur_kernel_size = int(blur_amount) * 2 + 1
            print(f"[IMG] Applying Gaussian Blur (Kernel: {blur_kernel_size}x{blur_kernel_size})...")
            img_processed = cv2.GaussianBlur(img_processed, (blur_kernel_size, blur_kernel_size), 0)
            processing_info += f" + Blur({blur_kernel_size}x{blur_kernel_size})"
            final_status_message += f"Applied blur ({blur_kernel_size}x{blur_kernel_size})."
        else:
            final_status_message += "No blur applied."

        # Add artifact warning if processing occurred
        if mask_applied:
             final_status_message += " Artifacts may be present."

        # 5. Encode Result Image
        is_success, buffer = cv2.imencode(".png", img_processed)
        if not is_success:
            raise ValueError("Could not encode processed image to PNG format.")
        processed_img_bytes = buffer.tobytes()
        print("[IMG] Processing successful.")

    except Exception as e:
        print(f"[IMG ERROR] Error during image processing: {e}")
        traceback.print_exc()
        # Return original bytes and error message
        processed_img_bytes = image_bytes
        final_status_message = f"Error processing image: {e}. Returning original."
        processing_info = "Error"

    return processed_img_bytes, final_status_message, processing_info


# --- Video Processing Helper ---
def attempt_video_object_removal_with_mask(video_path, output_path, mask_bytes=None, blur_amount=0):
    """
    Processes a video frame-by-frame: applies STATIC mask inpainting, then optional blur.

    Args:
        video_path (str): Path to the temporary input video file.
        output_path (str): Path where the processed video should be saved.
        mask_bytes (bytes, optional): Raw bytes of the static PNG mask image. Defaults to None.
        blur_amount (int, optional): Blur level (0-50). 0 means no blur. Defaults to 0.

    Returns:
        tuple: (status_message, processing_info_string)
               Raises an exception on critical failure.
    """
    processing_info = "Local OpenCV Video Processing"
    final_status_message = ""
    cap = None
    writer = None
    mask_applied_to_video = False

    try:
        # 1. Open Video Capture
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError(f"Could not open video file: {video_path}")

        # 2. Get Video Properties
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) # Might be approximate

        if not (fps > 0 and frame_width > 0 and frame_height > 0):
             raise ValueError(f"Invalid video properties read: {frame_width}x{frame_height} @ {fps:.2f} FPS")
        print(f"[VID] Input video: {frame_width}x{frame_height} @ {fps:.2f} FPS (~{total_frames} frames).")

        # 3. Load and Prepare Static Mask
        mask_static = None
        if mask_bytes:
             try:
                 nparr_mask = np.frombuffer(mask_bytes, np.uint8)
                 decoded_mask = cv2.imdecode(nparr_mask, cv2.IMREAD_GRAYSCALE)
                 if decoded_mask is not None:
                     if decoded_mask.shape[0]!=frame_height or decoded_mask.shape[1]!=frame_width:
                         print(f"[VID WARN] Resizing STATIC mask from {decoded_mask.shape} to {(frame_height, frame_width)}")
                         mask_static = cv2.resize(decoded_mask, (frame_width, frame_height), interpolation=cv2.INTER_NEAREST)
                     else:
                         mask_static = decoded_mask
                     # Ensure mask is binary
                     _, mask_static = cv2.threshold(mask_static, 127, 255, cv2.THRESH_BINARY)
                     if np.sum(mask_static > 0) > 0:
                         mask_applied_to_video = True
                         print("[VID] Valid STATIC mask loaded.")
                     else:
                         print("[VID WARN] Provided video mask was empty (all black).")
                         mask_static = None
                 else:
                     print("[VID WARN] Could not decode mask data for video.")
             except Exception as mask_err:
                 print(f"[VID ERROR] Error processing mask for video: {mask_err}")
                 traceback.print_exc()
                 mask_static = None

        # If no valid mask, create an empty one to prevent errors, but don't set mask_applied_to_video
        if mask_static is None:
            print("[VID] No valid mask provided or mask was empty. Creating black mask (no inpainting).")
            mask_static = np.zeros((frame_height, frame_width), dtype=np.uint8)
            processing_info = "No Mask / Skipped Inpainting"
        elif mask_applied_to_video:
             processing_info = "Static Mask Inpainting (TELEA, R5)"


        # 4. Setup Video Writer
        # Use 'mp4v' codec for MP4 output. Others exist (e.g., 'XVID', 'MJPG').
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        writer = cv2.VideoWriter(output_path, fourcc, fps, (frame_width, frame_height))
        if not writer.isOpened():
            raise ValueError(f"Could not open video writer for path: {output_path}")
        print(f"[VID] Video writer opened for: {output_path}")

        # 5. Prepare Blur Kernel (if needed)
        blur_kernel_size = 0
        if blur_amount > 0:
            blur_kernel_size = int(blur_amount) * 2 + 1
            print(f"[VID] Blur will be applied (Kernel: {blur_kernel_size}x{blur_kernel_size}).")
            processing_info += f" + Blur({blur_kernel_size}x{blur_kernel_size})"

        # 6. Process Frames
        processed_frame_count = 0
        print("[VID] Starting frame processing loop...")
        while True:
            ret, frame = cap.read()
            if not ret:
                break # End of video

            # Apply Inpainting (will do nothing if mask is all black)
            processed_frame = cv2.inpaint(frame, mask_static, inpaintRadius=5, flags=cv2.INPAINT_TELEA)

            # Apply Blur (if kernel size > 0)
            if blur_kernel_size > 0:
                 processed_frame = cv2.GaussianBlur(processed_frame, (blur_kernel_size, blur_kernel_size), 0)

            # Write the processed frame
            writer.write(processed_frame)
            processed_frame_count += 1

            # Progress indicator (every 100 frames or last frame)
            if total_frames > 0 and (processed_frame_count % 100 == 0 or processed_frame_count == total_frames):
                 percent_done = (processed_frame_count / total_frames) * 100
                 print(f"[VID Progress] Processed {processed_frame_count}/{total_frames} frames ({percent_done:.1f}%)...")
            elif processed_frame_count % 100 == 0: # Fallback if total_frames is 0
                 print(f"[VID Progress] Processed {processed_frame_count} frames...")

        print(f"[VID] Finished processing. Total frames written: {processed_frame_count}")

        # Construct final status message
        if mask_applied_to_video:
             final_status_message = "Video inpainting (static mask) complete. "
        else:
             final_status_message = "Video processing complete (no mask applied). "

        if blur_kernel_size > 0:
             final_status_message += f"Applied blur ({blur_kernel_size}x{blur_kernel_size}). "
        else:
             final_status_message += "No blur applied. "

        if mask_applied_to_video:
             final_status_message += "Artifacts likely, especially with motion."

    except Exception as e:
        print(f"[VID ERROR] Error during video processing: {e}")
        traceback.print_exc()
        # Cleanup: Release resources and remove potentially corrupt output file
        if cap is not None and cap.isOpened(): cap.release()
        if writer is not None and writer.isOpened(): writer.release()
        if os.path.exists(output_path):
            try:
                os.remove(output_path)
                print(f"[VID Cleanup] Removed potentially incomplete output file: {output_path}")
            except OSError as remove_err:
                print(f"[VID ERROR] Could not remove incomplete output file {output_path}: {remove_err}")
        # Re-raise the exception to be caught by the route handler
        raise e
    finally:
        # Ensure resources are always released
        if cap is not None and cap.isOpened():
            cap.release()
            # print("[VID] Video capture released.")
        if writer is not None and writer.isOpened():
            writer.release()
            # print("[VID] Video writer released.")

    return final_status_message, processing_info


# --- Flask Routes ---

@app.route('/')
def index():
    """Serves the main HTML page."""
    current_year = datetime.datetime.now().year
    return render_template('index.html', current_year=current_year)

@app.route('/output/<path:filename>')
def output_file(filename):
    """Serves files from the output directory."""
    print(f"[SERVE] Request for output file: {filename}")
    # Security: Prevent accessing files outside the output folder
    safe_folder = os.path.abspath(app.config['OUTPUT_FOLDER'])
    safe_filepath = os.path.abspath(os.path.join(safe_folder, filename))

    if not safe_filepath.startswith(safe_folder):
        print(f"[SERVE FORBIDDEN] Attempt to access path outside output folder: {filename}")
        return jsonify({"error": "Forbidden path"}), 403

    try:
        # send_from_directory handles Range requests for seeking in videos
        return send_from_directory(app.config['OUTPUT_FOLDER'], filename, as_attachment=False)
    except FileNotFoundError:
        print(f"[SERVE NOT FOUND] File not found in output folder: {filename}")
        return jsonify({"error": "File not found"}), 404
    except Exception as serve_err:
        print(f"[SERVE ERROR] Error serving file {filename}: {serve_err}")
        traceback.print_exc()
        return jsonify({"error": "Server error serving file"}), 500


@app.route('/api/process', methods=['POST'])
def process_data():
    """Handles file upload, mask data, processes image/video, returns results."""
    print("\n--- [API /api/process] Request Received ---")
    try:
        # 1. Validate File Input
        if 'image_file' not in request.files:
            print("[API ERROR] No 'image_file' part in the request.")
            return jsonify({"error": "No 'image_file' part in the request."}), 400
        file = request.files['image_file']
        if not file or file.filename == '':
            print("[API ERROR] No file selected or filename is empty.")
            return jsonify({"error": "No file selected."}), 400

        print(f"[API] Received file: '{file.filename}'")

        # 2. Determine File Type
        mime_type, _ = mimetypes.guess_type(file.filename)
        is_video = mime_type and mime_type.startswith('video')
        is_image = mime_type and mime_type.startswith('image')
        if not is_video and not is_image:
            print(f"[API ERROR] Unsupported file type: '{mime_type}' for file '{file.filename}'")
            return jsonify({"error": f"Unsupported file type: '{mime_type or 'Unknown'}'. Upload image or video."}), 415
        print(f"[API] Detected file type: {'Video' if is_video else 'Image'} (MIME: {mime_type})")

        # 3. Get Mask Data from Form
        mask_bytes = None
        mask_data_uri = request.form.get('mask_data', None)
        if mask_data_uri and mask_data_uri.startswith('data:image/png;base64,'):
            try:
                base64_string = mask_data_uri.split(',', maxsplit=1)[1]
                mask_bytes = base64.b64decode(base64_string)
                print(f"[API] Received valid mask data ({len(mask_bytes)} bytes).")
            except Exception as e_mask:
                print(f"[API WARN] Error decoding mask base64 data: {e_mask}")
                mask_bytes = None # Treat as no mask if decoding fails
        else:
            print("[API] No valid mask data URI found in form.")

        # 4. Get Blur Amount from Form
        blur_amount = 0
        try:
            blur_input = request.form.get('blur_amount', '0')
            blur_amount = int(float(blur_input)) # Allow float input, convert to int
            # Clamp blur amount to a reasonable range
            blur_amount = max(0, min(blur_amount, 50))
            print(f"[API] Blur amount requested: {blur_input}, using: {blur_amount}")
        except ValueError:
            print(f"[API WARN] Invalid blur amount received ('{blur_input}'). Using 0.")
            blur_amount = 0

        # --- 5. Process Based on File Type ---
        api_result = {}
        status_message = "Processing failed."
        processing_method_detail = "Unknown"
        http_status = 500 # Default to server error

        if is_image:
            print("[API] Starting image processing...")
            image_bytes = file.read() # Read file content into memory
            processed_bytes, status_message, processing_method_detail = attempt_image_object_removal_with_mask(
                image_bytes, mask_bytes, blur_amount
            )
            # Encode result for sending back as data URI
            encoded_image = base64.b64encode(processed_bytes).decode('utf-8')
            api_result["result_image_data"] = f"data:image/png;base64,{encoded_image}"
            print(f"[API] Image processing status: {status_message}")

        elif is_video:
            print("[API] Starting video processing...")
            temp_video_path = None
            output_filename = None
            try:
                # Create a temporary file to save the upload
                # Using NamedTemporaryFile needs careful handling on Windows (delete=False)
                # Save within output folder simplifies potential permission issues
                temp_suffix = os.path.splitext(file.filename)[1] or '.tmp' # Keep original extension if possible
                with tempfile.NamedTemporaryFile(delete=False, suffix=temp_suffix, dir=app.config['OUTPUT_FOLDER']) as temp_video:
                   file.save(temp_video.name)
                   temp_video_path = temp_video.name
                print(f"[API] Uploaded video saved temporarily to: {temp_video_path}")

                # Define output path
                output_filename = f"{uuid.uuid4()}.mp4" # Standardize output to MP4
                output_path = os.path.join(app.config['OUTPUT_FOLDER'], output_filename)

                # Call the video processing function
                status_message, processing_method_detail = attempt_video_object_removal_with_mask(
                    temp_video_path, output_path, mask_bytes, blur_amount
                )

                # If successful, generate URL for the result
                # url_for generates a relative URL like '/output/filename.mp4'
                video_url = url_for('output_file', filename=output_filename, _external=False)
                api_result["result_video_url"] = video_url
                api_result["result_filename"] = output_filename # For download attribute in HTML
                print(f"[API] Video processing status: {status_message}")
                print(f"[API] Result video URL: {video_url}")

            except Exception as video_err:
                 # Catch errors specifically from video processing helper or file saving
                 status_message = f"Error during video processing: {video_err}"
                 processing_method_detail = "Video Error"
                 print(f"[API ERROR] Video Processing Failed: {video_err}")
                 traceback.print_exc()
                 # Clean up the failed output file if it exists (helper might have failed before writing)
                 if output_filename and os.path.exists(os.path.join(app.config['OUTPUT_FOLDER'], output_filename)):
                     try: os.remove(os.path.join(app.config['OUTPUT_FOLDER'], output_filename))
                     except OSError as e_rem: print(f"[API ERROR] Failed to remove partial output {output_filename}: {e_rem}")
                 api_result["error"] = status_message # Add explicit error field
            finally:
                 # Always clean up the temporary input file
                 if temp_video_path and os.path.exists(temp_video_path):
                     try:
                         os.remove(temp_video_path)
                         print(f"[API] Removed temporary input video: {temp_video_path}")
                     except OSError as e_rem_tmp:
                         print(f"[API ERROR] Failed to remove temporary input {temp_video_path}: {e_rem_tmp}")

        # --- 6. Construct Final JSON Response ---
        if "Error" in status_message or "Error" in processing_method_detail or "error" in api_result:
            api_result["status"] = "error"
            http_status = 500 if "error" in api_result else 200 # Use 500 for backend errors, 200 if processing function reported error but route is okay
        elif "Warning" in status_message or "Skipped" in status_message or "original" in status_message.lower() or "No Mask" in processing_method_detail:
            api_result["status"] = "warning"
            http_status = 200
        else:
            api_result["status"] = "success"
            http_status = 200

        api_result["message"] = status_message
        api_result["details"] = {
            "processing_method": processing_method_detail,
            "input_filename": file.filename,
            "input_mimetype": mime_type,
            "is_video": is_video,
            "mask_provided": bool(mask_bytes),
            "blur_applied": blur_amount > 0,
            "blur_level": blur_amount,
            "disclaimer": "Quality varies. Artifacts possible, especially with video (static mask used). Video processing can be slow."
        }

        print(f"[API] Responding with status: {api_result.get('status', 'N/A')}, HTTP code: {http_status}")
        print(f"--- [/api/process] Request Handled ---")
        return jsonify(api_result), http_status

    except Exception as e:
         # Catch unexpected errors in the route handler itself
         print(f"[API FATAL ERROR] Unexpected error in /api/process route: {e}")
         traceback.print_exc()
         return jsonify({
             "error": "An unexpected server error occurred.",
             "status": "error",
             "message": f"Server Error: {e}",
         }), 500


# --- Run the Application ---
if __name__ == '__main__':
    # Set debug=False for production!
    # Use a proper WSGI server like Gunicorn or Waitress in production.
    # Example: gunicorn --workers 4 --bind 0.0.0.0:5000 app:app
    app.run(debug=True, host='0.0.0.0', port=5000)
