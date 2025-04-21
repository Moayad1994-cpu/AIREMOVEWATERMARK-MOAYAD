
document.addEventListener('DOMContentLoaded', () => {
    // --- Element Selection ---
    const formFile = document.getElementById('api-form-file');
    const imageUpload = document.getElementById('image-upload');
    const dropZone = document.getElementById('drop-zone');
    const previewContainer = document.getElementById('preview-container');
    const imagePreview = document.getElementById('image-preview');
    const videoPreview = document.getElementById('video-preview');
    const previewInstruction = document.getElementById('preview-instruction');
    const clearPreviewBtn = document.getElementById('clear-preview-btn');
    const processBtn = document.getElementById('process-btn');
    const processHeader = document.getElementById('process-header');
    const loadingIndicator = document.getElementById('loading-indicator');
    const loadingVideoNote = document.getElementById('loading-video-note');
    const resultsBox = document.getElementById('results-box');
    const errorMessageDiv = document.getElementById('error-message');
    const successMessageDiv = document.getElementById('success-message');
    const resultStatusP = document.getElementById('result-status');
    const resultMessageP = document.getElementById('result-message');
    const resultDetailsContainer = document.getElementById('result-details-container');
    const resultDetailsDiv = document.getElementById('result-details');
    const resultImage = document.getElementById('result-image');
    const resultImageContainer = document.querySelector('.result-image-container');
    const resultVideoArea = document.getElementById('result-video-area');
    const resultVideoPlayer = document.getElementById('result-video-player');
    const downloadBtn = document.getElementById('download-btn');
    const themeToggleButton = document.getElementById('theme-toggle');
    const canvas = document.getElementById('draw-canvas');
    const ctx = canvas ? canvas.getContext('2d') : null;
    const undoBtn = document.getElementById('undo-last-btn');
    const clearDrawingBtn = document.getElementById('clear-drawing-btn');
    const brushSizeSlider = document.getElementById('brush-size');
    const brushSizeValueSpan = document.getElementById('brush-size-value');
    const toolRadios = document.querySelectorAll('input[name="draw-tool"]');
    const brushControls = document.getElementById('brush-controls');
    const polygonControls = document.getElementById('polygon-controls');
    const finishPolygonBtn = document.getElementById('finish-polygon-btn');
    const blurSlider = document.getElementById('blur-slider');
    const blurValueSpan = document.getElementById('blur-value');
    const blurAmountHidden = document.getElementById('blur-amount-hidden'); // Hidden input for form

    // --- State Variables ---
    let currentTool = 'brush'; // 'brush', 'box', 'polygon'
    let isDrawing = false; // Mouse button down AND actively drawing (brush/box)
    let isAddingPolygonPoint = false; // Flag specifically for polygon point addition clicks
    let startX, startY, currentX, currentY; // Coordinates for drawing operations
    let scaleX = 1, scaleY = 1; // Scale factor between displayed preview size and original media size
    let originalWidth = 0, originalHeight = 0; // Store original media dimensions
    let currentFile = null; // Holds the File object
    let isVideoFile = false; // Flag if the current file is a video
    let videoObjectURL = null; // Stores the URL created for video preview
    let shapes = []; // Stores completed drawings: { type: 'brush'/'box'/'polygon', data: ..., closed?: bool, size?: number }
    let currentPolygonPoints = []; // Points for the polygon currently being drawn
    let currentBrushSize = 10; // Current brush size from slider
    let currentBlurAmount = 0; // Current blur amount from slider
    let resizeObserver = null; // Observer for preview element resize

    // --- Utility Functions ---
    const showElement = (el) => { if (el) el.style.display = 'block'; };
    const showFlexElement = (el) => { if (el) el.style.display = 'flex'; }; // For flex containers like dropzone, loading
    const hideElement = (el) => { if (el) el.style.display = 'none'; };
    const showInlineBlockElement = (el) => { if (el) el.style.display = 'inline-block'; }; // For buttons etc.

    // --- Canvas Drawing Functions ---
    const clearCanvas = () => {
        if (ctx) {
             // Adjust for device pixel ratio scaling if used
             const dpr = window.devicePixelRatio || 1;
             // Need to clear the scaled buffer size
             ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    };

    const redrawCanvas = () => {
        if (!ctx || !canvas || canvas.width === 0 || canvas.height === 0) return;
        clearCanvas();
        const theme = document.body.getAttribute('data-theme') || 'light';
        const dpr = window.devicePixelRatio || 1; // Get DPR

        // Note: Coordinates (shape.data, currentPolygonPoints, startX/Y, currentX/Y)
        // are stored relative to the DISPLAYED canvas size (CSS pixels).
        // The canvas context is scaled by DPR, so drawing happens correctly on HiDPI.

        // Draw finished shapes from the 'shapes' array
        shapes.forEach(shape => {
            ctx.save(); // Save context state before drawing each shape
            ctx.beginPath();
            if (shape.type === 'brush' && shape.data.length >= 2) {
                ctx.strokeStyle = theme === 'dark' ? 'rgba(255, 77, 77, 0.7)' : 'rgba(255, 0, 0, 0.7)';
                // Brush size is already relative to display, scale linewidth by DPR? No, context is scaled.
                ctx.lineWidth = shape.size;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.moveTo(shape.data[0].x, shape.data[0].y);
                for (let i = 1; i < shape.data.length; i++) { ctx.lineTo(shape.data[i].x, shape.data[i].y); }
                ctx.stroke();
            } else if (shape.type === 'box' && shape.data) {
                ctx.strokeStyle = theme === 'dark' ? 'rgba(100, 150, 255, 0.8)' : 'rgba(0, 100, 255, 0.8)';
                ctx.fillStyle = theme === 'dark' ? 'rgba(100, 150, 255, 0.3)' : 'rgba(0, 100, 255, 0.3)';
                ctx.lineWidth = 2; // Consistent line width regardless of DPR? Or scale? Let's keep it simple.
                ctx.fillRect(shape.data.x, shape.data.y, shape.data.w, shape.data.h);
                ctx.strokeRect(shape.data.x, shape.data.y, shape.data.w, shape.data.h);
            } else if (shape.type === 'polygon' && shape.data.length >= 2) {
                ctx.strokeStyle = theme === 'dark' ? 'rgba(100, 220, 150, 0.8)' : 'rgba(0, 200, 100, 0.8)';
                ctx.fillStyle = theme === 'dark' ? 'rgba(100, 220, 150, 0.4)' : 'rgba(0, 200, 100, 0.4)';
                ctx.lineWidth = 2;
                ctx.moveTo(shape.data[0].x, shape.data[0].y);
                for (let i = 1; i < shape.data.length; i++) { ctx.lineTo(shape.data[i].x, shape.data[i].y); }
                if (shape.closed) {
                     ctx.closePath();
                     ctx.fill(); // Fill only closed polygons
                }
                ctx.stroke();
            }
            ctx.restore(); // Restore context state
        });

        // Draw current interactive element (e.g., rubber-band box, live brush stroke)
        if (isDrawing) {
             ctx.save();
            if (currentTool === 'brush' && currentPolygonPoints.length >= 1) {
                ctx.strokeStyle = theme === 'dark' ? 'rgba(255, 77, 77, 0.7)' : 'rgba(255, 0, 0, 0.7)';
                ctx.lineWidth = currentBrushSize;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.beginPath();
                ctx.moveTo(currentPolygonPoints[0].x, currentPolygonPoints[0].y);
                for (let i = 1; i < currentPolygonPoints.length; i++) { ctx.lineTo(currentPolygonPoints[i].x, currentPolygonPoints[i].y); }
                ctx.stroke();
            } else if (currentTool === 'box' && startX !== undefined) {
                ctx.strokeStyle = theme === 'dark' ? 'rgba(100, 150, 255, 0.8)' : 'rgba(0, 100, 255, 0.8)';
                ctx.fillStyle = theme === 'dark' ? 'rgba(100, 150, 255, 0.2)' : 'rgba(0, 100, 255, 0.2)';
                ctx.lineWidth = 1; // Thin line for rubber-banding
                const currentWidth = currentX - startX;
                const currentHeight = currentY - startY;
                ctx.strokeRect(startX, startY, currentWidth, currentHeight);
                ctx.fillRect(startX, startY, currentWidth, currentHeight);
            }
             ctx.restore();
        }

        // Draw current polygon points and line-to-cursor
        if (currentTool === 'polygon' && currentPolygonPoints.length > 0) {
             ctx.save();
             // Draw points (small circles)
             ctx.fillStyle = 'rgba(0, 0, 255, 0.7)';
             const pointRadius = 4; // Adjust point size as needed
             currentPolygonPoints.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, pointRadius, 0, Math.PI * 2); ctx.fill(); });

             // Draw connecting lines for existing points
             if (currentPolygonPoints.length >= 2) {
                 ctx.strokeStyle = theme === 'dark' ? 'rgba(100, 220, 150, 0.8)' : 'rgba(0, 200, 100, 0.8)';
                 ctx.lineWidth = 1; // Thin line connecting points
                 ctx.beginPath();
                 ctx.moveTo(currentPolygonPoints[0].x, currentPolygonPoints[0].y);
                 for (let i = 1; i < currentPolygonPoints.length; i++) { ctx.lineTo(currentPolygonPoints[i].x, currentPolygonPoints[i].y); }
                 ctx.stroke();
             }

             // Draw dashed line from last point to current cursor position (if not adding a point)
             if (currentX !== undefined && currentY !== undefined && !isAddingPolygonPoint) {
                 ctx.strokeStyle = 'rgba(150, 150, 150, 0.6)';
                 ctx.lineWidth = 1;
                 ctx.setLineDash([4, 4]); // Dashed line style
                 ctx.beginPath();
                 ctx.moveTo(currentPolygonPoints[currentPolygonPoints.length - 1].x, currentPolygonPoints[currentPolygonPoints.length - 1].y);
                 ctx.lineTo(currentX, currentY);
                 ctx.stroke();
                 ctx.setLineDash([]); // Reset to solid line
             }
             ctx.restore();
        }
    };


    // --- UI State and Button Management ---
    const updateButtonStates = () => {
        const hasDrawings = shapes.length > 0 || (currentTool === 'polygon' && currentPolygonPoints.length > 0);
        const canProcess = currentFile && shapes.length > 0; // Can only process if file loaded AND shapes exist

        processBtn.disabled = !canProcess;

        if (hasDrawings) {
            showInlineBlockElement(undoBtn);
            showInlineBlockElement(clearDrawingBtn);
        } else {
            hideElement(undoBtn);
            hideElement(clearDrawingBtn);
        }

        // Finish Polygon button visibility
        hideElement(finishPolygonBtn);
        if (currentTool === 'polygon' && currentPolygonPoints.length >= 3) {
            showInlineBlockElement(finishPolygonBtn);
        }
    };

    // --- Canvas Sizing and Scaling ---
    const sizeCanvasToPreview = (previewElement) => {
        if (!canvas || !previewElement) {
            console.warn("Cannot size canvas: Required element missing.");
            return false;
        }

        const displayWidth = previewElement.offsetWidth;
        const displayHeight = previewElement.offsetHeight;

        if (displayWidth <= 0 || displayHeight <= 0) {
            console.warn(`Cannot size canvas yet: Preview dimensions are ${displayWidth}x${displayHeight}. Waiting...`);
            return false;
        }

        // Get original media dimensions
        if (previewElement.tagName === 'VIDEO') {
            originalWidth = previewElement.videoWidth;
            originalHeight = previewElement.videoHeight;
        } else { // Image
            originalWidth = previewElement.naturalWidth;
            originalHeight = previewElement.naturalHeight;
        }

         if (originalWidth <= 0 || originalHeight <= 0) {
            console.warn(`Cannot size canvas: Original media dimensions invalid ${originalWidth}x${originalHeight}. Media might not be fully loaded.`);
            return false;
         }

        // Set canvas display size (CSS pixels) to match the preview exactly
        canvas.style.width = `${displayWidth}px`;
        canvas.style.height = `${displayHeight}px`;

        // Set canvas internal drawing buffer size (physical pixels) for HiDPI
        const dpr = window.devicePixelRatio || 1;
        canvas.width = displayWidth * dpr;
        canvas.height = displayHeight * dpr;

        // Scale the drawing context to normalize coordinates to CSS pixels
        if (ctx) {
             ctx.resetTransform(); // Reset any previous scaling/transforms
             ctx.scale(dpr, dpr);
        } else {
             console.error("Canvas context (ctx) is null during sizing!");
             return false;
        }

        // Calculate scale factors for converting display coordinates (CSS px) back to original media coordinates
        scaleX = originalWidth / displayWidth;
        scaleY = originalHeight / displayHeight;

        console.log(`Canvas Resized & Scaled:
         - Display Size: ${displayWidth}x${displayHeight} (CSS px)
         - Buffer Size: ${canvas.width}x${canvas.height} (Physical px, DPR: ${dpr})
         - Original Media: ${originalWidth}x${originalHeight}
         - Scale (Orig/Display): X=${scaleX.toFixed(3)}, Y=${scaleY.toFixed(3)}`);

        redrawCanvas(); // Redraw any existing shapes after resizing
        return true;
    };

     // Observer to automatically resize canvas if the preview element's size changes
     const setupResizeObserver = (previewElement) => {
         if (resizeObserver) {
             resizeObserver.disconnect(); // Stop observing previous element
         }
         if (!window.ResizeObserver) {
             console.warn("ResizeObserver not supported. Canvas might not resize automatically.");
             return;
         }
         resizeObserver = new ResizeObserver(entries => {
             for (let entry of entries) {
                 if (entry.target === previewElement) {
                     console.log("ResizeObserver detected preview size change. Resizing canvas.");
                     sizeCanvasToPreview(previewElement);
                 }
             }
         });
         resizeObserver.observe(previewElement);
     };


    // --- Media Preview Handling ---
    const showPreview = (file) => {
        currentFile = file;
        shapes = []; // Clear previous shapes
        currentPolygonPoints = []; // Clear polygon points
        isVideoFile = file.type.startsWith('video');

        resetDrawingState(); // Clear canvas, reset interaction states
        hideElement(resultsBox);
        hideElement(loadingIndicator);
        hideElement(dropZone); // Hide upload prompt
        showElement(previewContainer); // Show the main preview area
        showElement(processHeader); // Show "3. Process" header
        updateButtonStates(); // Update buttons (Process should be disabled initially)

        // Revoke previous video object URL to prevent memory leaks
        if (videoObjectURL) {
            URL.revokeObjectURL(videoObjectURL);
            videoObjectURL = null;
            console.log("Revoked previous video Object URL.");
        }

        // Reset media elements and listeners
        imagePreview.onload = null; imagePreview.onerror = null; imagePreview.src = '#'; hideElement(imagePreview);
        videoPreview.onloadedmetadata = null; videoPreview.onerror = null; videoPreview.src = ''; hideElement(videoPreview);
        if (resizeObserver) resizeObserver.disconnect(); // Stop observing previous element

        let previewElement = null; // The element to display (img or video)

        if (isVideoFile) {
            console.log("Setting up video preview for:", file.name);
            previewInstruction.textContent = "Video loading... Use controls, pause, then mark objects.";
            previewElement = videoPreview;
            showElement(videoPreview);

            try {
                videoObjectURL = URL.createObjectURL(file);
                videoPreview.src = videoObjectURL;

                // --- Video Event Handlers ---
                videoPreview.onloadedmetadata = () => {
                    console.log(`Video metadata loaded: ${videoPreview.videoWidth}x${videoPreview.videoHeight}`);
                    previewInstruction.textContent = "Video ready. Use controls, pause, then mark objects.";
                    // Attempt initial sizing, then observe for changes
                    sizeCanvasToPreview(videoPreview);
                    setupResizeObserver(videoPreview);
                    resetDrawingState(); // Redraw clean canvas
                };
                videoPreview.onerror = (e) => {
                    console.error("Video Loading Error:", e, videoPreview.error);
                    const errorMsg = videoPreview.error ? ` (${videoPreview.error.code}: ${videoPreview.error.message})` : '';
                    showError(`Failed to load video preview${errorMsg}. The format might be unsupported or the file corrupt.`);
                    clearAll(); // Reset UI
                };

            } catch (e) {
                console.error("Error creating video object URL:", e);
                showError("Could not create video preview. The file might be invalid or corrupted.");
                clearAll();
                return;
            }
        } else { // Image
            console.log("Setting up image preview for:", file.name);
            previewInstruction.textContent = "Image loading...";
            previewElement = imagePreview;
            showElement(imagePreview);

            const reader = new FileReader();
            reader.onload = (e) => {
                imagePreview.src = e.target.result;
                // --- Image Event Handlers ---
                imagePreview.onload = () => {
                     console.log(`Image loaded: ${imagePreview.naturalWidth}x${imagePreview.naturalHeight}`);
                     previewInstruction.textContent = "Image loaded. Use tools to mark objects.";
                     // Attempt initial sizing, then observe for changes
                     sizeCanvasToPreview(imagePreview);
                     setupResizeObserver(imagePreview);
                     resetDrawingState(); // Redraw clean canvas
                };
                imagePreview.onerror = (err) => {
                     console.error("Image Preview Load Error:", err);
                     showError("Could not load the image preview.");
                     clearAll();
                };
                // Handle case where image might be cached and already loaded
                if (imagePreview.complete && imagePreview.naturalWidth > 0) {
                     imagePreview.onload();
                }
            };
            reader.onerror = (err) => {
                console.error("FileReader Error:", err);
                showError("Could not read the image file.");
                clearAll();
            };
            reader.readAsDataURL(file);
        }
    };

    // --- Reset and Clear Functions ---
    const resetDrawingState = () => {
        // Only resets the *interaction* state, not the saved shapes
        isDrawing = false;
        isAddingPolygonPoint = false;
        // currentPolygonPoints = []; // Don't clear points here, only on tool change or explicit clear
        startX = startY = currentX = currentY = undefined;
        clearCanvas(); // Clear visual canvas
        redrawCanvas(); // Redraw existing shapes if any
        updateButtonStates(); // Update button enable/disable states
    };

    const undoLast = () => {
        // If currently drawing a polygon, remove the last point
        if (currentTool === 'polygon' && currentPolygonPoints.length > 0) {
            currentPolygonPoints.pop();
            console.log(`Undid polygon point. ${currentPolygonPoints.length} points left.`);
        }
        // Otherwise, remove the last completed shape
        else if (shapes.length > 0) {
            shapes.pop();
            console.log(`Undid last shape. ${shapes.length} shapes left.`);
        } else {
            console.log("Nothing to undo.");
            return; // Nothing changed
        }
        redrawCanvas();
        updateButtonStates();
    };

    const clearAllDrawings = () => {
        shapes = []; // Clear completed shapes
        currentPolygonPoints = []; // Clear any in-progress polygon
        console.log("Cleared all drawings.");
        resetDrawingState(); // Reset interaction state and redraw clean canvas
    };

    const clearAll = () => {
         console.log("Clearing entire state: file, preview, drawings, results.");
         currentFile = null; isVideoFile = false;
         originalWidth = 0; originalHeight = 0; scaleX = 1; scaleY = 1;
         if (resizeObserver) resizeObserver.disconnect(); // Stop observing

         // Reset file input visually
         if (imageUpload) imageUpload.value = '';

         // Clear media previews and revoke URLs
         if (imagePreview) { imagePreview.src = '#'; hideElement(imagePreview); }
         if (videoPreview) { videoPreview.pause(); videoPreview.src = ''; hideElement(videoPreview); }
         if (videoObjectURL) { URL.revokeObjectURL(videoObjectURL); videoObjectURL = null; }

         // Reset UI visibility
         hideElement(previewContainer);
         hideElement(processHeader);
         showFlexElement(dropZone); // Show upload area again
         hideElement(resultsBox);
         hideElement(loadingIndicator);

         // Clear drawings and interaction state
         shapes = [];
         currentPolygonPoints = []; // Ensure points are cleared too
         resetDrawingState();

         // Reset options
         if (blurSlider) blurSlider.value = 0;
         if (blurValueSpan) blurValueSpan.textContent = 'None';
         if (blurAmountHidden) blurAmountHidden.value = '0';
         currentBlurAmount = 0;

         updateButtonStates(); // Ensure buttons are correctly disabled
    };

    // --- Theme Management ---
    const applyTheme = (theme) => {
         document.body.setAttribute('data-theme', theme);
         localStorage.setItem('theme', theme);
         console.log(`Theme applied: ${theme}`);
         redrawCanvas(); // Redraw canvas with new theme colors if needed
     };

     const setupTheme = () => {
        if (themeToggleButton) {
            themeToggleButton.addEventListener('click', () => {
                const currentTheme = document.body.getAttribute('data-theme') || 'light';
                const newTheme = currentTheme === 'light' ? 'dark' : 'light';
                applyTheme(newTheme);
            });
            // Apply saved theme or default to light
            const savedTheme = localStorage.getItem('theme');
            const initialTheme = (savedTheme === 'dark' || savedTheme === 'light') ? savedTheme : 'light';
            applyTheme(initialTheme);
        } else {
            applyTheme('light'); // Default if no toggle button
        }
     }

    // --- File Input and Drag/Drop Handling ---
    const handleFileSelect = (file) => {
        if (!file) {
            showError("No file provided.");
            return;
        }
        const maxSize = 100 * 1024 * 1024; // 100 MB limit from backend config
        const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff'];
        const allowedVideoTypesPrefix = 'video/'; // Accept any video/* MIME type

        console.log(`File selected: Name: ${file.name}, Type: ${file.type || 'N/A'}, Size: ${(file.size / (1024*1024)).toFixed(2)} MB`);

        // Validate Size
        if (file.size > maxSize) {
             showError(`File too large (${(file.size / (1024*1024)).toFixed(1)} MB). Max size: 100 MB.`);
             clearAll(); // Reset UI
             return;
        }

        // Validate Type
        if (allowedImageTypes.includes(file.type) || file.type?.startsWith(allowedVideoTypesPrefix)) {
            clearAll(); // Clear previous state before showing new preview
            showPreview(file);
        } else {
            showError(`Unsupported file type: '${file.type || 'Unknown'}'. Please upload a common image or video format.`);
            clearAll(); // Reset UI
        }
    };

    const setupFileInputs = () => {
        // Drag and Drop
        if (dropZone) {
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                dropZone.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); }, false);
            });
            ['dragenter', 'dragover'].forEach(eventName => {
                dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
            });
            ['dragleave', 'drop'].forEach(eventName => {
                dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
            });
            dropZone.addEventListener('drop', (e) => {
                const files = e.dataTransfer.files;
                if (files && files.length > 0) {
                    handleFileSelect(files[0]); // Process the first dropped file
                }
            }, false);
            // Click to upload
            dropZone.addEventListener('click', () => {
                 if (imageUpload && (!previewContainer || previewContainer.style.display === 'none')) {
                     imageUpload.click();
                 }
             });
        }
        // Standard File Input
        if (imageUpload) {
            imageUpload.addEventListener('change', (e) => {
                if (e.target.files && e.target.files.length > 0) {
                    handleFileSelect(e.target.files[0]);
                }
            });
        }
    }

    // --- Button Event Listeners ---
    const setupButtonListeners = () => {
        if (clearPreviewBtn) { clearPreviewBtn.addEventListener('click', clearAll); }
        if (undoBtn) { undoBtn.addEventListener('click', undoLast); }
        if (clearDrawingBtn) { clearDrawingBtn.addEventListener('click', clearAllDrawings); }
        if (finishPolygonBtn) { finishPolygonBtn.addEventListener('click', () => finishCurrentPolygon(true)); }
    };

    // --- Tool Selection Logic ---
    const triggerToolChange = () => {
         // Handles actions needed when the drawing tool changes
         const selectedTool = document.querySelector('input[name="draw-tool"]:checked');
         currentTool = selectedTool ? selectedTool.value : 'brush'; // Default to brush if none selected
         console.log("Tool changed to:", currentTool);

         // Reset interaction states relevant to tool switching
         isDrawing = false;
         isAddingPolygonPoint = false;
         // Keep currentPolygonPoints if switching TO polygon, clear if switching AWAY
         if (currentTool !== 'polygon') {
             currentPolygonPoints = [];
         }
         startX = startY = currentX = currentY = undefined; // Clear box start points

         // Update UI elements (controls visibility, cursor style)
         if (currentTool === 'brush') {
             showElement(brushControls); hideElement(polygonControls); canvas.style.cursor = 'crosshair'; // Or custom brush cursor
         } else if (currentTool === 'polygon') {
             hideElement(brushControls); showElement(polygonControls); canvas.style.cursor = 'copy';
         } else { // Box tool
             hideElement(brushControls); hideElement(polygonControls); canvas.style.cursor = 'crosshair';
         }

         redrawCanvas(); // Redraw to remove transient elements like line-to-cursor
         updateButtonStates(); // Update button states (e.g., Finish Polygon)
     }

    const setupToolSelection = () => {
        toolRadios.forEach(radio => {
            radio.addEventListener('change', triggerToolChange);
        });
         // Trigger once on load to set initial state based on default checked radio
         triggerToolChange();
    };


    // --- Tool Option Sliders (Brush Size, Blur) ---
    const setupOptionSliders = () => {
        // Brush Size
        if (brushSizeSlider && brushSizeValueSpan) {
            currentBrushSize = parseInt(brushSizeSlider.value, 10);
            brushSizeValueSpan.textContent = currentBrushSize;
            brushSizeSlider.addEventListener('input', (e) => {
                currentBrushSize = parseInt(e.target.value, 10);
                brushSizeValueSpan.textContent = currentBrushSize;
            });
        }
        // Blur Amount
         if (blurSlider && blurValueSpan && blurAmountHidden) {
             const updateBlurDisplay = () => {
                 currentBlurAmount = parseInt(blurSlider.value, 10);
                 // Show kernel size (odd number) or "None"
                 blurValueSpan.textContent = currentBlurAmount === 0 ? 'None' : `${currentBlurAmount * 2 + 1}x${currentBlurAmount * 2 + 1}`;
                 blurAmountHidden.value = currentBlurAmount; // Update hidden input for form submission
             }
             blurSlider.addEventListener('input', updateBlurDisplay);
             updateBlurDisplay(); // Set initial value display
         }
    }


    // --- Polygon Finishing Logic ---
    const finishCurrentPolygon = (forceClose = true) => {
        if (currentTool !== 'polygon' || currentPolygonPoints.length < 3) {
            console.log("Cannot finish polygon: Tool is not Polygon or less than 3 points.");
            return;
        }

        shapes.push({ type: 'polygon', data: [...currentPolygonPoints], closed: forceClose });
        console.log("Finished polygon shape.");

        // Reset polygon drawing state
        currentPolygonPoints = [];
        isDrawing = false; // Should be false anyway for polygon
        isAddingPolygonPoint = false;
        redrawCanvas(); // Show the final filled/closed shape
        updateButtonStates(); // Update buttons (disable finish, enable process if needed)
    };

    // --- Canvas Event Listeners Setup ---
    const setupCanvasEventListeners = () => {
        if (!canvas || !ctx) {
            console.error("Canvas or Context not available, cannot add drawing listeners.");
            showError("Drawing feature failed to initialize. Please refresh.");
            return;
        }

        // Helper to get event position relative to canvas (in CSS pixels)
        const getEventPos = (evt) => {
            const rect = canvas.getBoundingClientRect();
            let clientX, clientY;

            // Handle mouse and touch events consistently
            if (evt.touches && evt.touches.length > 0) {
                clientX = evt.touches[0].clientX; clientY = evt.touches[0].clientY;
            } else if (evt.changedTouches && evt.changedTouches.length > 0) {
                clientX = evt.changedTouches[0].clientX; clientY = evt.changedTouches[0].clientY;
            } else {
                clientX = evt.clientX; clientY = evt.clientY;
            }
            // Calculate position relative to the canvas element's bounding box
            const canvasX = clientX - rect.left;
            const canvasY = clientY - rect.top;
            return { x: canvasX, y: canvasY };
        };

        // --- Mouse Events ---
        canvas.addEventListener('mousedown', (e) => {
            if (!currentFile || e.button !== 0) return; // Only handle left mouse button
            e.preventDefault(); // Prevent text selection etc.
            const pos = getEventPos(e);

            if (currentTool === 'brush') {
                isDrawing = true;
                currentPolygonPoints = [{ x: pos.x, y: pos.y }]; // Start new brush path
                redrawCanvas();
            } else if (currentTool === 'box') {
                isDrawing = true;
                startX = pos.x; startY = pos.y;
                currentX = startX; currentY = startY; // Initialize for rubber-banding
            } else if (currentTool === 'polygon') {
                 isDrawing = false; // Not dragging for polygon
                 isAddingPolygonPoint = true; // Signal that a point is being added
                 currentPolygonPoints.push({ x: pos.x, y: pos.y });
                 console.log(`Added polygon point ${currentPolygonPoints.length} at (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})`);

                 // Check for closing click near the start point
                 if (currentPolygonPoints.length >= 3) {
                     const firstPoint = currentPolygonPoints[0];
                     const dx = pos.x - firstPoint.x;
                     const dy = pos.y - firstPoint.y;
                     const dist = Math.sqrt(dx * dx + dy * dy);
                     const closeThreshold = 10 / ((window.devicePixelRatio || 1)); // Threshold in CSS pixels (adjust if needed)
                     if (dist < closeThreshold) {
                         console.log("Clicked near start point, closing polygon.");
                         finishCurrentPolygon(true);
                         return; // Exit early as polygon is complete
                     }
                 }
                 redrawCanvas();
                 updateButtonStates();
                 // Reset flag shortly after to allow line-to-cursor rendering on mousemove
                 setTimeout(() => { isAddingPolygonPoint = false; }, 50);
             }
        });

        canvas.addEventListener('mousemove', (e) => {
            if (!currentFile) return;
            e.preventDefault();
            const pos = getEventPos(e);
            currentX = pos.x; currentY = pos.y; // Update cursor position

            if (isDrawing) { // Drawing brush or box
                if (currentTool === 'brush') {
                    currentPolygonPoints.push({ x: pos.x, y: pos.y });
                }
                redrawCanvas(); // Update brush path or box rubber-band
            } else if (currentTool === 'polygon' && currentPolygonPoints.length > 0 && !isAddingPolygonPoint) {
                // Redraw to show line from last polygon point to cursor
                redrawCanvas();
            }
        });

        canvas.addEventListener('mouseup', (e) => {
            if (!currentFile || e.button !== 0) return;
            e.preventDefault();

            if (isDrawing) { // Finalizing brush or box
                isDrawing = false;
                const pos = getEventPos(e); // Get final position

                if (currentTool === 'brush') {
                    if (currentPolygonPoints.length > 1) {
                        shapes.push({ type: 'brush', data: [...currentPolygonPoints], size: currentBrushSize });
                        console.log(`Finished brush shape (${currentPolygonPoints.length} points).`);
                    } else { console.log("Brush stroke too short."); }
                    currentPolygonPoints = []; // Clear temporary path
                } else if (currentTool === 'box') {
                    if (startX === undefined) return; // Should not happen if isDrawing is true
                    const x1 = Math.min(startX, pos.x); const y1 = Math.min(startY, pos.y);
                    const x2 = Math.max(startX, pos.x); const y2 = Math.max(startY, pos.y);
                    const width = x2 - x1; const height = y2 - y1;
                    if (width > 3 && height > 3) { // Minimum size check
                        shapes.push({ type: 'box', data: { x: x1, y: y1, w: width, h: height } });
                        console.log(`Finished box shape at (${x1.toFixed(1)}, ${y1.toFixed(1)}), size ${width.toFixed(1)}x${height.toFixed(1)}.`);
                    } else { console.log("Box too small."); }
                    startX = startY = undefined; // Reset box start
                }
                redrawCanvas(); // Redraw final shape
                updateButtonStates(); // Update button states (enable Process if needed)
            }
            // Reset polygon interaction flag if it was somehow set
            if (isAddingPolygonPoint) { isAddingPolygonPoint = false; }
        });

        canvas.addEventListener('mouseleave', (e) => {
            // If dragging brush/box off canvas, finalize the shape
            if (isDrawing && (currentTool === 'brush' || currentTool === 'box')) {
                console.log("Mouse left while drawing, finalizing shape.");
                 // Create a synthetic mouseup event at the last known cursor position (currentX/Y)
                 // This ensures the shape is completed properly
                 const mouseUpEvent = new MouseEvent('mouseup', {
                     bubbles: true,
                     cancelable: true,
                     clientX: e.clientX, // Use event's clientX/Y for consistency
                     clientY: e.clientY,
                     button: 0 // Left button
                 });
                 canvas.dispatchEvent(mouseUpEvent);
            }
            // Clear cursor position for polygon line preview when mouse leaves
            currentX = undefined; currentY = undefined;
            if (currentTool === 'polygon' && currentPolygonPoints.length > 0) {
                redrawCanvas(); // Redraw to remove the line-to-cursor
            }
        });

        canvas.addEventListener('mouseenter', (e) => {
            // Update cursor position when re-entering, important for polygon line preview
             if (!isDrawing && currentTool === 'polygon' && currentPolygonPoints.length > 0) {
                 const pos = getEventPos(e);
                 currentX = pos.x; currentY = pos.y;
                 redrawCanvas();
             }
         });

         // --- Touch Events ---
         let touchIdentifier = null; // Track the primary touch for drawing

         canvas.addEventListener('touchstart', (e) => {
             if (!currentFile) return;
             // Only handle single touch for drawing initiation
             if (e.touches.length === 1) {
                 e.preventDefault(); // Prevent default scroll/zoom only when drawing starts
                 touchIdentifier = e.touches[0].identifier;
                 // Dispatch simulated mousedown
                 const mouseDownEvent = new MouseEvent('mousedown', {
                     bubbles: true, cancelable: true, clientX: e.touches[0].clientX, clientY: e.touches[0].clientY, button: 0
                 });
                 canvas.dispatchEvent(mouseDownEvent);
             }
             // Ignore multi-touch for now
         }, { passive: false }); // Required to call preventDefault

         canvas.addEventListener('touchmove', (e) => {
             if (!currentFile || touchIdentifier === null) return; // Only track if a touch drawing started
             // Find the tracked touch
             let trackedTouch = null;
             for (let i = 0; i < e.touches.length; i++) {
                 if (e.touches[i].identifier === touchIdentifier) {
                     trackedTouch = e.touches[i];
                     break;
                 }
             }
             if (trackedTouch) {
                 e.preventDefault(); // Prevent scrolling while drawing
                 // Dispatch simulated mousemove
                 const mouseMoveEvent = new MouseEvent('mousemove', {
                     bubbles: true, cancelable: true, clientX: trackedTouch.clientX, clientY: trackedTouch.clientY
                 });
                 canvas.dispatchEvent(mouseMoveEvent);
             }
         }, { passive: false }); // Required to call preventDefault

         const touchEndHandler = (e) => {
             if (!currentFile || touchIdentifier === null) return;
             // Find if the ended touch was the one we were tracking
             let trackedTouchEnded = false;
             let endClientX, endClientY;
             for (let i = 0; i < e.changedTouches.length; i++) {
                 if (e.changedTouches[i].identifier === touchIdentifier) {
                     trackedTouchEnded = true;
                     endClientX = e.changedTouches[i].clientX;
                     endClientY = e.changedTouches[i].clientY;
                     break;
                 }
             }
             if (trackedTouchEnded) {
                 e.preventDefault();
                 // Dispatch simulated mouseup
                 const mouseUpEvent = new MouseEvent('mouseup', {
                     bubbles: true, cancelable: true, clientX: endClientX, clientY: endClientY, button: 0
                 });
                 canvas.dispatchEvent(mouseUpEvent);
                 touchIdentifier = null; // Stop tracking
             }
         };

         canvas.addEventListener('touchend', touchEndHandler);
         canvas.addEventListener('touchcancel', (e) => { // Handle interruptions
             console.log("Touch Cancelled");
             touchEndHandler(e); // Treat cancel like end for finalization
             // Optionally add more specific cancel logic if needed
             touchIdentifier = null;
             isDrawing = false;
             isAddingPolygonPoint = false;
             // Consider resetting startX/Y etc. if needed
         });

    };


    // --- Form Submission ---
    const setupFormSubmit = () => {
        if (formFile) {
            formFile.addEventListener('submit', (event) => {
                event.preventDefault(); // We handle submission via fetch

                // --- Validations ---
                if (!currentFile) { showError("Select a file first."); return; }
                if (shapes.length === 0) { showError("Mark the object(s) to remove first."); return; }
                if (originalWidth <= 0 || originalHeight <= 0) {
                    showError("Cannot get original media dimensions. Wait for preview or reload file."); return;
                }

                // --- Generate Mask Canvas at Original Dimensions ---
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = originalWidth;
                tempCanvas.height = originalHeight;
                const tempCtx = tempCanvas.getContext('2d');
                if (!tempCtx) { showError("Cannot create mask canvas context."); return; }

                console.log(`Generating mask at ${originalWidth}x${originalHeight}...`);
                tempCtx.fillStyle = 'black'; // Mask background is black
                tempCtx.fillRect(0, 0, originalWidth, originalHeight);
                tempCtx.strokeStyle = 'white'; // Shapes are white
                tempCtx.fillStyle = 'white';
                tempCtx.lineCap = 'round'; tempCtx.lineJoin = 'round';

                // Draw shapes onto mask, scaling coordinates from display size (CSS px) to original size
                shapes.forEach(s => {
                    tempCtx.save();
                    tempCtx.beginPath();
                    if (s.type === 'brush' && s.data.length >= 2) {
                         // Scale brush size based on the calculated scaling factors
                         const avgScale = (scaleX + scaleY) / 2; // Use average scale
                         tempCtx.lineWidth = Math.max(1, Math.round(s.size * avgScale));
                         // Scale points
                         tempCtx.moveTo(s.data[0].x * scaleX, s.data[0].y * scaleY);
                         for (let i=1; i<s.data.length; i++) { tempCtx.lineTo(s.data[i].x*scaleX, s.data[i].y*scaleY); }
                         tempCtx.stroke();
                    } else if (s.type === 'box' && s.data) {
                         // Scale box position and dimensions
                         tempCtx.fillRect(s.data.x*scaleX, s.data.y*scaleY, s.data.w*scaleX, s.data.h*scaleY);
                    } else if (s.type === 'polygon' && s.data.length >= 3 && s.closed) {
                         // Scale polygon points
                         tempCtx.moveTo(s.data[0].x*scaleX, s.data[0].y*scaleY);
                         for (let i=1; i<s.data.length; i++) { tempCtx.lineTo(s.data[i].x*scaleX, s.data[i].y*scaleY); }
                         tempCtx.closePath();
                         tempCtx.fill();
                    }
                    tempCtx.restore();
                });

                // Get mask as base64 PNG
                const maskDataURL = tempCanvas.toDataURL('image/png');
                if (!maskDataURL || maskDataURL === 'data:,') { showError("Failed to generate mask data."); return; }
                console.log(`Generated mask data URL (${(maskDataURL.length / 1024).toFixed(1)} KB)`);

                // --- Prepare FormData ---
                const formData = new FormData();
                formData.append('image_file', currentFile);
                formData.append('mask_data', maskDataURL);
                formData.append('blur_amount', currentBlurAmount.toString()); // Send current blur value

                // --- Send API Request ---
                handleApiRequest('/api/process', { method: 'POST', body: formData });
            });
        }
    };

    // --- API Request Handling ---
    const handleApiRequest = async (url, options) => {
        showFlexElement(loadingIndicator);
        hideElement(resultsBox); // Hide previous results
        hideElement(errorMessageDiv); hideElement(successMessageDiv);
        if (isVideoFile) { showElement(loadingVideoNote); } else { hideElement(loadingVideoNote); }

        try {
            console.log(`Sending API request to ${url}...`);
            const response = await fetch(url, options);
            console.log(`Received response status: ${response.status}`);

            const contentType = response.headers.get("content-type");
            let data;
            if (contentType && contentType.includes("application/json")) {
                data = await response.json();
                console.log('API JSON Response:', data);
            } else {
                 const textResponse = await response.text();
                 console.error('Non-JSON response received:', textResponse.substring(0, 500));
                 throw new Error(`Server returned non-JSON response (Status: ${response.status}). Check server logs.`);
            }

            if (!response.ok) { // Check for HTTP error codes (4xx, 5xx)
                 throw new Error(data?.error || data?.message || `Request failed with status ${response.status}`);
            }

            // Check application-level status from JSON for potential errors reported by backend logic
            if (data?.status === 'error') {
                 throw new Error(data.message || data.error || 'Processing failed on server.');
            }

            showSuccess(data); // Show success/warning results

        } catch (error) {
            console.error('API Request Error:', error);
            showError(error.message || 'Unknown request error.'); // Display error message from caught error
        } finally {
            hideElement(loadingIndicator); // Always hide loading indicator
        }
    };

    // --- Display API Results ---
    const showSuccess = (data) => {
        hideElement(errorMessageDiv); // Ensure error is hidden
        showElement(resultsBox);
        showElement(successMessageDiv); // Show success container

        // Status and Message (handle potential missing fields)
        const status = data?.status || 'unknown';
        resultStatusP.textContent = `Status: ${status.charAt(0).toUpperCase() + status.slice(1)}`; // Capitalize status
        resultStatusP.style.color = 'var(--text-color)'; // Default color
        if (status === 'success') resultStatusP.style.color = 'var(--success-color)';
        else if (status === 'warning') resultStatusP.style.color = 'var(--warning-color)';
        // Error status handled by showError, but include here for completeness if needed
        else if (status === 'error') resultStatusP.style.color = 'var(--error-color)';

        resultMessageP.textContent = `Message: ${data?.message || 'No message received.'}`;

        // Details Section
        if (data?.details && typeof data.details === 'object') {
            try {
                 // Format details into a readable string within a <pre> tag
                 let detailsText = '';
                 for (const [key, value] of Object.entries(data.details)) {
                     // Simple formatting: key: value
                     detailsText += `${key}: ${JSON.stringify(value)}\n`;
                 }
                 resultDetailsDiv.innerHTML = `<pre>${detailsText.trim()}</pre>`;
            } catch (jsonError) {
                 console.error("Error formatting details JSON:", jsonError)
                 resultDetailsDiv.innerHTML = '<pre>Error displaying details.</pre>';
            }
            showElement(resultDetailsContainer);
        } else {
            hideElement(resultDetailsContainer);
        }

        // Reset media elements before showing new ones
        hideElement(resultImageContainer); hideElement(resultImage); resultImage.src = '#';
        hideElement(resultVideoArea); hideElement(resultVideoPlayer); resultVideoPlayer.src = '';
        hideElement(downloadBtn); downloadBtn.href = '#'; downloadBtn.removeAttribute('download');

        // Display Result Image
        if (data?.result_image_data) {
            console.log("Displaying image result.");
            resultImage.src = data.result_image_data;
            showElement(resultImage);
            showElement(resultImageContainer);
            downloadBtn.href = data.result_image_data;
            const fname = data.details?.input_filename || 'image.png';
            const baseName = fname.split('.').slice(0, -1).join('.') || fname;
            downloadBtn.setAttribute('download', `processed_${baseName}.png`);
            showInlineBlockElement(downloadBtn);
        }
        // Display Result Video
        else if (data?.result_video_url) {
            console.log("Displaying video result player.");
            resultVideoPlayer.src = data.result_video_url; // URL provided by backend
            showElement(resultVideoPlayer);
            showElement(resultVideoArea);
            downloadBtn.href = data.result_video_url;
            const fname = data.details?.result_filename || 'video.mp4'; // Use backend filename if provided
            downloadBtn.setAttribute('download', `processed_${fname}`);
            showInlineBlockElement(downloadBtn);
            resultVideoPlayer.load(); // Important: Tell the video player to load the new source
        }
        else {
            console.log("No result image or video data found in success response.");
             if (status === 'success') { // Only add note if status was success but no output
                 resultMessageP.textContent += " (Note: No output file was generated).";
             }
        }
    };

    const showError = (message) => {
        hideElement(successMessageDiv); // Hide success content
        errorMessageDiv.textContent = `Error: ${message}`;
        showElement(errorMessageDiv);
        showElement(resultsBox); // Show the results box to contain the error
        hideElement(loadingIndicator);
        // Ensure media placeholders are hidden on error
        hideElement(resultImageContainer); hideElement(resultImage);
        hideElement(resultVideoArea); hideElement(resultVideoPlayer);
        hideElement(downloadBtn);
    };

    // --- Initialization ---
    const initializeApp = () => {
        console.log("Initializing Object Remover App...");
        if (!canvas || !ctx) {
             console.error("CRITICAL: Canvas or rendering context not found. Drawing will not work.");
             showError("Failed to initialize the drawing canvas. Please refresh the page or try a different browser.");
             // You might want to disable more UI elements here if the canvas is fundamental
             if (formFile) formFile.style.pointerEvents = 'none'; // Disable form interactions
             return; // Stop initialization
        }
        setupTheme();
        setupFileInputs();
        setupButtonListeners();
        setupToolSelection();
        setupOptionSliders();
        setupCanvasEventListeners();
        setupFormSubmit();
        clearAll(); // Start with a clean initial state
        console.log("Initialization complete.");
    }

    // Run Initialization when the DOM is ready
    initializeApp();

}); // End DOMContentLoaded
