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
    const loadingIndicator = document.getElementById('loading-indicator');
    const resultsBox = document.getElementById('results-box');
    const errorMessageDiv = document.getElementById('error-message');
    const successMessageDiv = document.getElementById('success-message');
    const resultStatusP = document.getElementById('result-status');
    const resultMessageP = document.getElementById('result-message');
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

    // --- State Variables ---
    let currentTool = 'brush';
    let isDrawing = false; // Mouse button down AND drawing action active
    let isDrawingPolygon = false; // Specifically adding polygon points
    let startX, startY, currentX, currentY;
    let scaleX = 1, scaleY = 1;
    let currentFile = null; let isVideoFile = false; let videoObjectURL = null;
    let shapes = []; // { type: 'brush'/'box'/'polygon', data: ..., closed?: bool, size?: number }
    let currentPolygonPoints = [];
    let currentBrushSize = 10;

    // --- Utility Functions ---
    const showElement = (el) => { if (el) el.style.display = 'block'; };
    const showFlexElement = (el) => { if (el) el.style.display = 'flex'; };
    const hideElement = (el) => { if (el) el.style.display = 'none'; };
    const showInlineBlockElement = (el) => { if (el) el.style.display = 'inline-block'; };

    // --- Canvas Drawing ---
    const clearCanvas = () => { if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height); };
    const redrawCanvas = () => {
        if (!ctx || !canvas || canvas.width === 0 || canvas.height === 0) return; clearCanvas();
        // Draw finished shapes
        shapes.forEach(shape => {
            ctx.beginPath();
            if (shape.type === 'brush' && shape.data.length >= 2) {
                ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--canvas-draw-color-brush').trim() || 'rgba(255,0,0,0.7)';
                ctx.lineWidth = shape.size; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                ctx.moveTo(shape.data[0].x, shape.data[0].y);
                for (let i = 1; i < shape.data.length; i++) { ctx.lineTo(shape.data[i].x, shape.data[i].y); }
                ctx.stroke();
            } else if (shape.type === 'box' && shape.data) {
                ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--canvas-draw-color-box').trim() || 'rgba(0,100,255,0.8)';
                ctx.lineWidth = 2; ctx.strokeRect(shape.data.x, shape.data.y, shape.data.w, shape.data.h);
            } else if (shape.type === 'polygon' && shape.data.length >= 2) {
                 ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--canvas-draw-color-polygon').trim() || 'rgba(0,200,100,0.8)';
                 ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--canvas-draw-color-polygon').replace('0.8)', '0.4)') || 'rgba(0,200,100,0.4)';
                 ctx.lineWidth = 2; ctx.moveTo(shape.data[0].x, shape.data[0].y);
                 for (let i = 1; i < shape.data.length; i++) { ctx.lineTo(shape.data[i].x, shape.data[i].y); }
                 if (shape.closed) { ctx.closePath(); ctx.fill(); } ctx.stroke();
            }
        });
        // Draw current interactive element
        if (isDrawing) {
            if (currentTool === 'brush' && currentPolygonPoints.length >= 2) { // Re-use currentPolygonPoints for live brush
                 ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--canvas-draw-color-brush').trim() || 'rgba(255,0,0,0.7)';
                 ctx.lineWidth = currentBrushSize; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(currentPolygonPoints[0].x, currentPolygonPoints[0].y);
                 for (let i = 1; i < currentPolygonPoints.length; i++) { ctx.lineTo(currentPolygonPoints[i].x, currentPolygonPoints[i].y); } ctx.stroke();
            } else if (currentTool === 'box' && startX !== undefined) {
                 ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--canvas-draw-color-box').trim() || 'rgba(0,100,255,0.8)';
                 ctx.lineWidth = 2; const cW = currentX - startX; const cH = currentY - startY; ctx.strokeRect(startX, startY, cW, cH);
            }
        }
        // Draw current polygon points/lines
        if (currentTool === 'polygon' && currentPolygonPoints.length > 0) {
             ctx.fillStyle = 'rgba(0, 0, 255, 0.6)'; currentPolygonPoints.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); });
             if (currentPolygonPoints.length >= 2) {
                 ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--canvas-draw-color-polygon').trim() || 'rgba(0,200,100,0.8)';
                 ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(currentPolygonPoints[0].x, currentPolygonPoints[0].y);
                 for (let i = 1; i < currentPolygonPoints.length; i++) { ctx.lineTo(currentPolygonPoints[i].x, currentPolygonPoints[i].y); } ctx.stroke();
             }
             if (currentX !== undefined && !isDrawingPolygon) { // Draw line to cursor only when not actively dragging (isDrawing refers to drag state)
                 ctx.strokeStyle = 'rgba(150, 150, 150, 0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(currentPolygonPoints[currentPolygonPoints.length - 1].x, currentPolygonPoints[currentPolygonPoints.length - 1].y); ctx.lineTo(currentX, currentY); ctx.stroke();
             }
        }
    };

    // --- Buttons & UI State ---
    const updateButtonStates = () => { const hasDrawings = shapes.length > 0; processBtn.disabled = !(currentFile && hasDrawings); if (hasDrawings) { showInlineBlockElement(undoBtn); showInlineBlockElement(clearDrawingBtn); } else { hideElement(undoBtn); hideElement(clearDrawingBtn); } hideElement(finishPolygonBtn); if (currentTool === 'polygon' && currentPolygonPoints.length >= 3) { showInlineBlockElement(finishPolygonBtn); } };

    // --- Canvas Sizing ---
    const sizeCanvasToPreview = (previewElement) => { if (!canvas || !previewElement) { console.warn("Cannot size: canvas or preview missing"); return false; } const dW = previewElement.offsetWidth; const dH = previewElement.offsetHeight; if (dW <= 0 || dH <= 0) { console.warn(`Cannot size: preview dimensions invalid ${dW}x${dH}`); return false; } canvas.width = dW; canvas.height = dH; let oW, oH; if (previewElement.tagName === 'VIDEO') { oW = previewElement.videoWidth; oH = previewElement.videoHeight; } else { oW = previewElement.naturalWidth; oH = previewElement.naturalHeight; } scaleX = (oW > 0 && dW > 0) ? oW / dW : 1; scaleY = (oH > 0 && dH > 0) ? oH / dH : 1; console.log(`Canvas: ${dW}x${dH}. Scale X/Y: ${scaleX.toFixed(3)}/${scaleY.toFixed(3)}`); redrawCanvas(); return true; };

    // --- Preview Logic ---
    const showPreview = (file) => {
        currentFile = file; shapes = []; currentPolygonPoints = []; isVideoFile = file.type.startsWith('video');
        resetDrawingState(); hideElement(resultsBox); hideElement(loadingIndicator);
        if (videoObjectURL && videoPreview.src === videoObjectURL) { URL.revokeObjectURL(videoObjectURL); videoObjectURL = null; }
        imagePreview.onload = null; videoPreview.onloadedmetadata = null; videoPreview.onerror = null;
        hideElement(imagePreview); hideElement(videoPreview);

        if (isVideoFile) {
            console.log("Video selected."); previewInstruction.textContent = "Pause video, then use tool to mark objects.";
            try { videoObjectURL = URL.createObjectURL(file); } catch (e) { console.error("Error creating object URL:", e); showError("Could not create video URL."); clearAll(); return; }
            videoPreview.src = videoObjectURL; showElement(videoPreview); hideElement(imagePreview);
            videoPreview.onloadedmetadata = () => { console.log("Video metadata loaded."); if (!sizeCanvasToPreview(videoPreview)) { setTimeout(() => sizeCanvasToPreview(videoPreview), 250); } resetDrawingState(); }; // Delay retry slightly longer
            videoPreview.onerror = (e) => { console.error("Video load error:", e); showError(`Video preview error: ${e.message || 'Cannot play video'}`); clearAll(); };
        } else { // Image
            console.log("Image selected."); previewInstruction.textContent = "Use tool to mark objects."; hideElement(videoPreview);
            const reader = new FileReader();
            reader.onload = (e) => { imagePreview.src = e.target.result; showElement(imagePreview); imagePreview.onload = () => { console.log("Image loaded."); if (!sizeCanvasToPreview(imagePreview)) { console.warn("Initial image sizing failed, maybe retry?"); } resetDrawingState(); }; if (imagePreview.complete && imagePreview.naturalWidth > 0) { imagePreview.onload(); } }
            reader.onerror = (err) => { console.error("FileReader error:", err); showError("Could not read image."); clearAll(); }; reader.readAsDataURL(file);
        }
        showElement(previewContainer); hideElement(dropZone); updateButtonStates();
    };

    // --- Reset/Clear ---
    const resetDrawingState = () => { clearCanvas(); isDrawing = false; isDrawingPolygon = false; currentPolygonPoints = []; startX = startY = currentX = currentY = undefined; redrawCanvas(); updateButtonStates(); };
    const undoLast = () => { if (shapes.length > 0) { shapes.pop(); console.log(`Undone. ${shapes.length} left.`); redrawCanvas(); } updateButtonStates(); };
    const clearAllDrawings = () => { shapes = []; console.log("Cleared drawings."); resetDrawingState(); };
    const clearAll = () => { currentFile = null; isVideoFile = false; if (imageUpload) imageUpload.value = ''; if (imagePreview) { imagePreview.src = '#'; imagePreview.onload = null; hideElement(imagePreview); } if (videoPreview) { videoPreview.pause(); videoPreview.src = ''; videoPreview.onloadedmetadata = null; videoPreview.onerror = null; hideElement(videoPreview); } if (videoObjectURL) { URL.revokeObjectURL(videoObjectURL); videoObjectURL = null; } hideElement(previewContainer); if (dropZone) dropZone.style.display = ''; shapes = []; resetDrawingState(); hideElement(resultsBox); hideElement(loadingIndicator); if (processBtn) processBtn.disabled = true; };

    // --- Theme Toggle ---
    const applyTheme = (t) => { document.body.setAttribute('data-theme', t); localStorage.setItem('theme', t); }; if (themeToggleButton) { themeToggleButton.addEventListener('click', () => { const cT=document.body.getAttribute('data-theme')||'light'; const nT=cT==='light'?'dark':'light'; applyTheme(nT); }); const sT=localStorage.getItem('theme')||'light'; applyTheme(sT); }

    // --- Drag & Drop / File Input ---
    const handleFileSelect = (file) => { if (file && (file.type.startsWith('image/') || file.type.startsWith('video/'))) { showPreview(file); } else { showError("Please select/drop a valid image or video file."); } };
    if (dropZone) { ['dragenter','dragover','dragleave','drop'].forEach(eN=>dropZone.addEventListener(eN,(e)=>{e.preventDefault();e.stopPropagation();},!1)); ['dragenter','dragover'].forEach(eN=>dropZone.addEventListener(eN,()=>dropZone.classList.add('dragover'),!1)); ['dragleave','drop'].forEach(eN=>dropZone.addEventListener(eN,()=>dropZone.classList.remove('dragover'),!1)); dropZone.addEventListener('drop',(e)=>{ const f=e.dataTransfer.files; if(f.length>0){ handleFileSelect(f[0]); } },!1); dropZone.addEventListener('click',()=>{ if(!previewContainer||previewContainer.style.display==='none'){if(imageUpload)imageUpload.click();}}); }
    if (imageUpload) { imageUpload.addEventListener('change', (e) => { if (e.target.files && e.target.files.length > 0) { handleFileSelect(e.target.files[0]); } }); }

    // --- Buttons ---
    if (clearPreviewBtn) { clearPreviewBtn.addEventListener('click', clearAll); } if (undoBtn) { undoBtn.addEventListener('click', undoLast); } if (clearDrawingBtn) { clearDrawingBtn.addEventListener('click', clearAllDrawings); } if (finishPolygonBtn) { finishPolygonBtn.addEventListener('click', () => finishCurrentPolygon(true)); }

    // --- Tool Selection ---
    toolRadios.forEach(radio => { radio.addEventListener('change', (e) => { currentTool = e.target.value; console.log("Tool:", currentTool); isDrawing = false; isDrawingPolygon = (currentTool === 'polygon'); currentPolygonPoints = []; // Clear polygon points on tool change
        redrawCanvas(); updateButtonStates(); if (currentTool === 'brush') { showElement(brushControls); hideElement(polygonControls); canvas.style.cursor = 'crosshair'; } else if (currentTool === 'polygon') { hideElement(brushControls); showElement(polygonControls); canvas.style.cursor = 'copy'; } else { hideElement(brushControls); hideElement(polygonControls); canvas.style.cursor = 'crosshair'; } }); });

    // --- Brush Size ---
    if (brushSizeSlider && brushSizeValueSpan) { currentBrushSize = parseInt(brushSizeSlider.value, 10); brushSizeValueSpan.textContent = currentBrushSize; brushSizeSlider.addEventListener('input', (e) => { currentBrushSize = parseInt(e.target.value, 10); brushSizeValueSpan.textContent = currentBrushSize; }); }

    // --- Polygon Finish ---
    const finishCurrentPolygon = (forceClose = true) => { if (currentPolygonPoints.length >= 3) { shapes.push({ type: 'polygon', data: [...currentPolygonPoints], closed: forceClose }); } else { console.log("Polygon too small."); } currentPolygonPoints = []; isDrawing = false; isDrawingPolygon = false; redrawCanvas(); updateButtonStates(); };

    // --- Canvas Events ---
    if (canvas && ctx) {
        const getMousePos = (evt) => { const rect = canvas.getBoundingClientRect(); return { x: evt.clientX - rect.left, y: evt.clientY - rect.top }; };
        canvas.addEventListener('mousedown', (e) => { if (!currentFile) return; const pos = getMousePos(e);
            if (currentTool === 'brush') { isDrawing = true; currentPolygonPoints = [{ x: pos.x, y: pos.y }]; } // Use polygon points for temp brush stroke
            else if (currentTool === 'box') { isDrawing = true; startX = pos.x; startY = pos.y; currentX = startX; currentY = startY; }
            else if (currentTool === 'polygon') { isDrawing = false; isDrawingPolygon = true; currentPolygonPoints.push({ x: pos.x, y: pos.y }); const pts=currentPolygonPoints; if(pts.length>=3){const dx=pos.x-pts[0].x; const dy=pos.y-pts[0].y; const d=Math.sqrt(dx*dx+dy*dy); const thresh=10/(Math.min(scaleX,scaleY)||1); if(d<thresh){finishCurrentPolygon(true);return;}} redrawCanvas(); updateButtonStates(); }
        });
        canvas.addEventListener('mousemove', (e) => { if (!currentFile) return; const pos = getMousePos(e); currentX = pos.x; currentY = pos.y; // Always track mouse position over canvas
            if (isDrawing) { if (currentTool === 'brush') { currentPolygonPoints.push({ x: pos.x, y: pos.y }); } redrawCanvas(); } // Redraw rubber band for brush/box
            else if (currentTool === 'polygon' && currentPolygonPoints.length > 0) { redrawCanvas(); } // Redraw polygon line to cursor
        });
        canvas.addEventListener('mouseup', (e) => { if (!currentFile || !isDrawing || currentTool === 'polygon') return; // Polygon adds points on mousedown
            isDrawing = false; const pos = getMousePos(e);
            if (currentTool === 'brush') { if (currentPolygonPoints.length > 1) { shapes.push({ type: 'brush', data: [...currentPolygonPoints], size: currentBrushSize }); } currentPolygonPoints = []; }
            else if (currentTool === 'box') { const x1=Math.min(startX,pos.x); const y1=Math.min(startY,pos.y); const x2=Math.max(startX,pos.x); const y2=Math.max(startY,pos.y); const fW=x2-x1; const fH=y2-y1; if(fW>3 && fH>3){ shapes.push({ type: 'box', data: { x: x1, y: y1, w: fW, h: fH } }); } startX = startY = currentX = currentY = undefined; }
            redrawCanvas(); updateButtonStates();
        });
        canvas.addEventListener('mouseleave', (e) => { // Use mouseup logic for consistency if dragging brush/box off canvas
            if (isDrawing && (currentTool === 'brush' || currentTool === 'box')) {
                 console.log("Mouse left, finishing drawing (Brush/Box).");
                 const pos = getMousePos(e); // Use last known position within canvas bounds ideally
                 isDrawing = false;
                 if (currentTool === 'brush') { if (currentPolygonPoints.length > 1) { shapes.push({ type: 'brush', data: [...currentPolygonPoints], size: currentBrushSize }); } currentPolygonPoints = []; }
                 else if (currentTool === 'box') { const x1=Math.min(startX,pos.x); const y1=Math.min(startY,pos.y); const x2=Math.max(startX,pos.x); const y2=Math.max(startY,pos.y); const fW=x2-x1; const fH=y2-y1; if(fW>3 && fH>3){ shapes.push({ type: 'box', data: { x: x1, y: y1, w: fW, h: fH } }); } startX = startY = currentX = currentY = undefined; }
                 redrawCanvas(); updateButtonStates();
            } else {
                // If just moving mouse off (not drawing), clear current position for polygon line
                currentX = undefined; currentY = undefined;
                if (currentTool === 'polygon') redrawCanvas(); // Redraw to remove line to cursor
            }
        });
        canvas.addEventListener('mouseenter', (e) => { // Update current position when re-entering
             if (!isDrawing && currentTool === 'polygon' && currentPolygonPoints.length > 0) {
                 const pos = getMousePos(e);
                 currentX = pos.x; currentY = pos.y;
                 redrawCanvas();
             }
         });

    } else { console.error("Canvas context not found!"); }

    // --- Form Submit ---
    if (formFile) {
        formFile.addEventListener('submit', (event) => {
            event.preventDefault(); if (!currentFile) { showError("Select file first."); return; } if (shapes.length === 0) { showError("Mark object(s) first."); return; }
            let oW, oH; const previewEl = isVideoFile ? videoPreview : imagePreview;
            if (isVideoFile) { oW = previewEl.videoWidth; oH = previewEl.videoHeight; } else { oW = previewEl.naturalWidth; oH = previewEl.naturalHeight; }
            if (!oW || !oH || oW <= 0 || oH <= 0) { showError("Cannot get original dimensions. Is preview loaded?"); return; }
            const tempCanvas = document.createElement('canvas'); tempCanvas.width = oW; tempCanvas.height = oH; const tempCtx = tempCanvas.getContext('2d',{ willReadFrequently: false }); // Set willReadFrequently if needed, maybe false is ok
            if (!tempCtx) { showError("Cannot create mask canvas."); return; }
            console.log(`Generating mask at ${oW}x${oH}...`); tempCtx.fillStyle = 'black'; tempCtx.fillRect(0, 0, oW, oH); tempCtx.strokeStyle = 'white'; tempCtx.fillStyle = 'white'; tempCtx.lineCap = 'round'; tempCtx.lineJoin = 'round';
            shapes.forEach(s => { // Draw all shapes onto scaled mask canvas
                tempCtx.beginPath(); // Start new path for each shape
                if (s.type === 'brush' && s.data.length >= 2) { const sSize = Math.max(1, Math.round(s.size*Math.min(scaleX,scaleY))); tempCtx.lineWidth = sSize; tempCtx.moveTo(s.data[0].x*scaleX, s.data[0].y*scaleY); for (let i=1; i<s.data.length; i++) { tempCtx.lineTo(s.data[i].x*scaleX, s.data[i].y*scaleY); } tempCtx.stroke(); }
                else if (s.type === 'box' && s.data) { tempCtx.fillRect(s.data.x*scaleX, s.data.y*scaleY, s.data.w*scaleX, s.data.h*scaleY); }
                else if (s.type === 'polygon' && s.data.length >= 3) { tempCtx.moveTo(s.data[0].x*scaleX, s.data[0].y*scaleY); for (let i=1; i<s.data.length; i++) { tempCtx.lineTo(s.data[i].x*scaleX, s.data[i].y*scaleY); } tempCtx.closePath(); tempCtx.fill(); }
            });
            const maskDataURL = tempCanvas.toDataURL('image/png'); const formData = new FormData(); formData.append('image_file', currentFile); formData.append('mask_data', maskDataURL); console.log(`Sending mask data (${(maskDataURL.length / 1024).toFixed(1)} KB)`);
            handleApiRequest('/api/process', { method: 'POST', body: formData });
        });
    }

    // --- API Request ---
    const handleApiRequest = async (url, options) => { showFlexElement(loadingIndicator); hideElement(resultsBox); errorMessageDiv.textContent = ''; try { const response = await fetch(url, options); const contentType = response.headers.get("content-type"); let data; if (contentType && contentType.indexOf("application/json")!==-1) { data = await response.json(); } else { const text = await response.text(); throw new Error(`Server non-JSON (Status: ${response.status}). Logs: ${text.substring(0,100)}`); } if (!response.ok) { throw new Error(data.error || `HTTP error ${response.status}`); } console.log('Backend Response:', data); showSuccess(data); } catch (error) { console.error('API Error:', error); showError(error.message || 'Unknown request error.'); } finally { hideElement(loadingIndicator); } };
    // --- Display Success ---
    const showSuccess = (data) => { showElement(resultsBox); showElement(successMessageDiv); hideElement(errorMessageDiv); resultStatusP.textContent = `Status: ${data.status||'Success'}`; resultStatusP.style.color = data.status==='warning'?'var(--accent-color)':'var(--success-color)'; resultMessageP.textContent = `Message: ${data.message||'Complete.'}`; if (data.details && typeof data.details === 'object') { resultDetailsDiv.innerHTML = `<pre>${JSON.stringify(data.details,null,2)}</pre>`; showElement(resultDetailsDiv); } else { hideElement(resultDetailsDiv); } hideElement(resultImageContainer); hideElement(resultImage); resultImage.src = '#'; hideElement(resultVideoArea); hideElement(resultVideoPlayer); resultVideoPlayer.src = ''; hideElement(downloadBtn);
        if (data.result_image_data) { console.log("Displaying image result."); resultImage.src = data.result_image_data; showElement(resultImage); showElement(resultImageContainer); downloadBtn.href = data.result_image_data; const fname = data.details?.input_filename||'image.png'; downloadBtn.setAttribute('download', `processed_${fname.split('.')[0]}.png`); showElement(downloadBtn); }
        else if (data.result_video_url) { console.log("Displaying video result player."); resultVideoPlayer.src = data.result_video_url; showElement(resultVideoPlayer); showElement(resultVideoArea); downloadBtn.href = data.result_video_url; const fname = data.details?.result_filename || 'video.mp4'; downloadBtn.setAttribute('download', `processed_${fname}`); showElement(downloadBtn); }
        else { console.log("No result media found."); if(data.status==='success'){ resultMessageP.textContent+=" (No output file)"; } }
    };
    // --- Display Error ---
    const showError = (message) => { hideElement(successMessageDiv); errorMessageDiv.textContent = `Error: ${message}`; showElement(errorMessageDiv); showElement(resultsBox); hideElement(loadingIndicator); hideElement(resultImage); hideElement(resultImageContainer); hideElement(resultVideoArea); hideElement(resultVideoPlayer); hideElement(downloadBtn); };
    // --- Initial State ---
    if(processBtn) processBtn.disabled = true; hideElement(previewContainer); hideElement(resultsBox); hideElement(loadingIndicator); console.log("Page loaded."); if(toolRadios.length > 0) toolRadios[0].checked = true; // Ensure brush is default tool visually too showElement(brushControls); hideElement(polygonControls); // Show default controls
});