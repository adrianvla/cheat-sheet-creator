const STORAGE_KEY = 'paperDesignConfig';
        let appState = [];
        let editingRef = null;
        let dragSrc = null;

        document.addEventListener('DOMContentLoaded', () => {
            loadState();
            renderApp();
            
            // Set up handlers
            document.getElementById('saveBtn').addEventListener('click', saveEdit);
            document.getElementById('deleteBtn').addEventListener('click', deleteBlock);
            document.getElementById('blockType').addEventListener('change', updateFormFields);
            document.getElementById('blockAutoHeight').addEventListener('change', updateFormFields);
        });

        // --- Drag & Drop Handlers ---

        function handleDragStart(e, pIdx, cIdx, bIdx) {
            dragSrc = { pIdx, cIdx, bIdx };
            e.target.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            // slight delay to allow the ghost image to be captured
            setTimeout(() => e.target.style.opacity = '0.5', 0);
        }

        function handleDragEnd(e) {
            e.target.classList.remove('dragging');
            e.target.style.opacity = '1';
            
            document.querySelectorAll('.drag-over-top, .drag-over-bottom, .drag-over-col').forEach(el => {
                el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-col');
            });
            dragSrc = null;
        }

        function handleDragOverBlock(e) {
            e.preventDefault(); // Essential to allow dropping
            if (!dragSrc) return;
            e.dataTransfer.dropEffect = 'move';
            
            const rect = e.currentTarget.getBoundingClientRect();
            const relY = e.clientY - rect.top;
            const height = rect.height;
            
            e.currentTarget.classList.remove('drag-over-top', 'drag-over-bottom');
            
            if (relY < height / 2) {
                e.currentTarget.classList.add('drag-over-top');
            } else {
                e.currentTarget.classList.add('drag-over-bottom');
            }
        }

        function handleDragLeaveBlock(e) {
            e.currentTarget.classList.remove('drag-over-top', 'drag-over-bottom');
        }

        function handleDropBlock(e, targetPIdx, targetCIdx, targetBIdx) {
            e.stopPropagation(); // Stop column drop
            e.preventDefault();
            
            if (!dragSrc) return;
            const { pIdx: srcP, cIdx: srcC, bIdx: srcB } = dragSrc;
            
            // Don't drop on self
            if (srcP === targetPIdx && srcC === targetCIdx && srcB === targetBIdx) return;

            const rect = e.currentTarget.getBoundingClientRect();
            const relY = e.clientY - rect.top;
            const insertAfter = relY > rect.height / 2;
            
            // Move Logic
            // 1. Remove from source
            const block = appState[srcP][srcC][srcB];
            appState[srcP][srcC].splice(srcB, 1);
            
            // 2. Adjust target index if in same column and we removed from above
            let finalTargetB = targetBIdx;
            if (srcP === targetPIdx && srcC === targetCIdx && srcB < targetBIdx) {
                finalTargetB--;
            }

            // 3. Insert
            if (insertAfter) {
                appState[targetPIdx][targetCIdx].splice(finalTargetB + 1, 0, block);
            } else {
                appState[targetPIdx][targetCIdx].splice(finalTargetB, 0, block);
            }
            
            saveState();
            renderApp();
        }

        function handleDragOverCol(e) {
             e.preventDefault();
             if (!dragSrc) return;
             e.currentTarget.classList.add('drag-over-col');
        }

        function handleDragLeaveCol(e) {
             e.currentTarget.classList.remove('drag-over-col');
        }

        function handleDropCol(e, targetPIdx, targetCIdx) {
            e.preventDefault();
            if (!dragSrc) return;
            const { pIdx: srcP, cIdx: srcC, bIdx: srcB } = dragSrc;
            
            const block = appState[srcP][srcC][srcB];
            
            // Remove from source
            appState[srcP][srcC].splice(srcB, 1);
            
            // Push to end of target col
            appState[targetPIdx][targetCIdx].push(block);
            
            saveState();
            renderApp();
        }


        /**
         * Refactored Auto-Distribute to be more robust and prevent "long page" issues.
         */
        async function autoDistributeBlocks() {
            if(!confirm('This will rearrange ALL blocks to fit into columns and create new pages as needed. Existing layout will be lost. Continue?')) return;

            // 1. Flatten all blocks
            const allBlocks = [];
            appState.forEach(pData => pData.forEach(cData => cData.forEach(bData => allBlocks.push(bData))));
            
            if (allBlocks.length === 0) return;

            // 2. Setup Measure Container
            // We append to body to ensure it's part of the DOM for measurement,
            // but keep it hidden and out of the flow.
            const measureContainer = document.createElement('div');
            measureContainer.style.position = 'absolute';
            measureContainer.style.top = '0';
            measureContainer.style.left = '0';
            measureContainer.style.visibility = 'hidden';
            measureContainer.style.background = 'white';
            measureContainer.style.zIndex = '-9999';
            // Match .col styles
            measureContainer.style.display = 'flex';
            measureContainer.style.flexDirection = 'column';
            
            // Calculate column width (A4 Landscape = 297mm. 3 cols. gaps ~2px total)
            // 297mm * 3.7795 px/mm ~= 1122.5px
            // (1122.5 - 2px gap) / 3 ~= 373.5px
            measureContainer.style.width = '373px'; 
            
            document.body.appendChild(measureContainer);

            // 3. Render Blocks for Measurement
            const blockElements = [];
            for (let blockData of allBlocks) {
                const el = createBlockElement(blockData);
                // Force layout context
                el.style.width = '100%'; 
                el.style.boxSizing = 'border-box';
                // Remove any margin that might affect measurement
                el.style.margin = '0';
                measureContainer.appendChild(el);
                blockElements.push(el);
            }

            // 4. Render Math (Async)
            if (window.renderMathInElement) {
                renderMathInElement(measureContainer, {
                    delimiters: [
                        {left: '$$', right: '$$', display: true},
                        {left: '$', right: '$', display: false},
                        {left: '\\(', right: '\\)', display: false},
                        {left: '\\[', right: '\\]', display: true}
                    ],
                    throwOnError : false
                });
            }

            // Wait extended time to ensure rendering is complete
            await new Promise(r => setTimeout(r, 600));

            // 5. Measure Heights
            const blockHeights = blockElements.map((el, idx) => {
                const rect = el.getBoundingClientRect();
                let h = rect.height;
                
                // Fallback for zero-height (e.g. if display:none issues occurred)
                // Default min height for auto-height blocks usually > 20px
                if (h <= 0) {
                    const content = allBlocks[idx].content || '';
                    h = content.length > 50 ? 60 : 40; 
                    if (allBlocks[idx].height && !allBlocks[idx].autoHeight) {
                        // Parse "2cm" -> approx pixels
                        if (allBlocks[idx].height.includes('cm')) {
                             h = parseFloat(allBlocks[idx].height) * 37.8;
                        }
                    }
                }
                // Precision: Round to nearest pixel, no buffer to avoid accumulation errors
                // We use ceil to ensure we don't cut off 0.5px text
                return Math.ceil(h); 
            });

            // Cleanup
            document.body.removeChild(measureContainer);

            // 6. Distribute
            // A4 Height = 210mm ~= 793px.
            // Safety Margin: Leave very small space (e.g., 5px) for browser inconsistencies
            const COL_MAX_HEIGHT_PX = 788;
            
            const newAppState = [];
            let currentPage = [[], [], []];
            let colIndex = 0;
            let currentColHeight = 0;

            allBlocks.forEach((blockData, i) => {
                const h = blockHeights[i];
                
                // Check if adding this block exceeds max height
                // If it's the FIRST block in the column, we must accept it (or it will never fit)
                if (currentColHeight + h > COL_MAX_HEIGHT_PX && currentColHeight > 0) {
                    // Move to next column
                    colIndex++;
                    currentColHeight = 0;

                    // If we exceed 3 columns (0, 1, 2), create new page
                    if (colIndex > 2) {
                        newAppState.push(currentPage);
                        currentPage = [[], [], []];
                        colIndex = 0;
                    }
                }

                currentPage[colIndex].push(blockData);
                currentColHeight += h;
            });
            
            // Push final page
            if (currentPage.some(c => c.length > 0)) {
                newAppState.push(currentPage);
            }

            // 7. Update State
            appState = newAppState;
            saveState();
            renderApp();
        }

        function exportConfig() {
            const dataStr = JSON.stringify(appState, null, 2);
            const blob = new Blob([dataStr], {type: "application/json"});
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.download = 'design.cheat-sheet';
            link.href = url;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }

        function importConfig(input) {
            const file = input.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const data = JSON.parse(e.target.result);
                    // Basic validation: should be an array (pages) of arrays (cols)
                    if (Array.isArray(data) && Array.isArray(data[0])) {
                        if(confirm('This will overwrite your current design. Continue?')) {
                            appState = data;
                            saveState();
                            renderApp();
                        }
                    } else {
                        alert('Invalid file format');
                    }
                } catch (err) {
                    alert('Error reading file: ' + err.message);
                }
                // Reset input so same file can be selected again
                input.value = '';
            };
            reader.readAsText(file);
        }

        function resetConfig() {
            if(confirm('This will DELETE all current work and start a new empty document. Are you sure?')) {
                localStorage.removeItem(STORAGE_KEY);
                location.reload();
            }
        }

        function createEmptyState() {
            // 1 page, 3 empty columns
            return [[ [], [], [] ]];
        }

        function createNewPage() {
            appState.push([ [], [], [] ]);
            saveState();
            renderApp();
            // Scroll to bottom
            window.scrollTo(0, document.body.scrollHeight);
        }

        function updateFormFields() {
            const type = document.getElementById('blockType').value;
            const isDivider = type.includes('divider');
            const isAutoHeight = document.getElementById('blockAutoHeight').checked;

            const controls = document.getElementById('propertyControls');
            controls.style.display = isDivider ? 'none' : 'block';
            
            if (!isDivider) {
                document.getElementById('heightGroup').style.display = isAutoHeight ? 'none' : 'block';
            }
        }

        function loadState() {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                appState = JSON.parse(stored);
            } else {
                appState = createEmptyState();
                saveState();
            }
        }

        function saveState() {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
        }

        function renderApp() {
            const root = document.getElementById('content-root');
            root.innerHTML = ''; 

            appState.forEach((pageData, pIdx) => {
                const pageEl = document.createElement('section');
                pageEl.className = 'page';
                
                const gridEl = document.createElement('div');
                gridEl.className = 'grid';

                pageData.forEach((colData, cIdx) => {
                    const colEl = document.createElement('div');
                    colEl.className = 'col';

                    // Col Drop Zone
                    colEl.ondragover = handleDragOverCol;
                    colEl.ondragleave = handleDragLeaveCol;
                    colEl.ondrop = (e) => handleDropCol(e, pIdx, cIdx);

                    colData.forEach((blockData, bIdx) => {
                        const el = createBlockElement(blockData);
                        el.onclick = () => openEditModal(pIdx, cIdx, bIdx);
                        
                        // Drag Attributes
                        el.draggable = true;
                        el.ondragstart = (e) => handleDragStart(e, pIdx, cIdx, bIdx);
                        el.ondragend = handleDragEnd;
                        el.ondragover = handleDragOverBlock;
                        el.ondragenter = handleDragOverBlock; 
                        el.ondragleave = handleDragLeaveBlock;
                        el.ondrop = (e) => handleDropBlock(e, pIdx, cIdx, bIdx);

                        colEl.appendChild(el);
                    });

                    // Add Button
                    const addBtn = document.createElement('button');
                    addBtn.className = 'add-block-btn no-print';
                    addBtn.textContent = '+ Add Block';
                    addBtn.onclick = (e) => {
                        e.stopPropagation();
                        addBlock(pIdx, cIdx);
                    };
                    colEl.appendChild(addBtn);

                    gridEl.appendChild(colEl);
                });

                pageEl.appendChild(gridEl);
                root.appendChild(pageEl);
            });

            // Render Math
            renderMathInElement(root, {
                delimiters: [
                    {left: '$$', right: '$$', display: true},
                    {left: '$', right: '$', display: false},
                    {left: '\\(', right: '\\)', display: false},
                    {left: '\\[', right: '\\]', display: true}
                ],
                throwOnError : false
            });

            // Auto Scale
            requestAnimationFrame(autoScaleAll);
        }

        function createBlockElement(data) {
            const div = document.createElement('div');
            
            if (data.type && data.type.includes('divider')) {
                div.className = data.type;
                if (data.type === 'double-divider') {
                    div.className = 'double-divider';
                }
            } else {
                div.className = `block ${data.type}`;
                if (data.important) div.classList.add('important');
                
                // Positioning
                div.style.justifyContent = data.hAlign || 'center';
                div.style.alignItems = data.vAlign || 'center';
                
                // Height defaults
                if (data.autoHeight) {
                    div.style.height = 'auto';
                    div.style.minHeight = '1cm'; // minimum
                    div.style.padding = '5px';
                } else {
                    div.style.height = data.height || '2cm';
                }

                const span = document.createElement('span');
                span.className = 'inside';
                span.innerText = data.content || ''; 
                
                // Apply manual font size if exists
                if (data.manualFontSize && parseInt(data.manualFontSize) !== 100) {
                     span.style.fontSize = data.manualFontSize + '%';
                }

                // Text align for the span itself (multi-line text)
                if (data.hAlign === 'flex-start') span.style.textAlign = 'left';
                else if (data.hAlign === 'flex-end') span.style.textAlign = 'right';
                else span.style.textAlign = 'center';

                div.appendChild(span);
            }
            return div;
        }

        function autoScaleAll() {
            appState.forEach((pageData, pIdx) => {
                pageData.forEach((colData, cIdx) => {
                    colData.forEach((blockData, bIdx) => {
                         // Only auto-scale if NOT auto-height
                         if (!blockData.autoHeight && !blockData.type.includes('divider')) {
                             // Find the actual DOM element
                             // This simple lookup depends on exact render order matches. 
                             // To be safer, we could put IDs, but traversing DOM is OK for this scale.
                             const pages = document.querySelectorAll('.page');
                             const col = pages[pIdx].querySelectorAll('.col')[cIdx];
                             // Account for add-btn being last child
                             const blockEl = col.children[bIdx];
                             if (blockEl && blockEl.classList.contains('block')) {
                                fitText(blockEl.querySelector('.inside'), blockData.manualFontSize || 100);
                             }
                         }
                    });
                });
            });
        }

        function fitText(el, baseSize) {
            const parent = el.parentElement;
            if (!parent) return;
            
            // If manual font size is set, we treat that as the MAXIMUM start point
            let size = parseInt(baseSize) || 100;
            
            el.style.fontSize = size + '%'; // Start reset
            
            // Reduce only
            while ( (el.scrollHeight > parent.clientHeight || el.scrollWidth > parent.clientWidth) && size > 10) {
                 size -= 5;
                 el.style.fontSize = size + '%';
            }
            // Fine tune 1%
            while ( (el.scrollHeight > parent.clientHeight || el.scrollWidth > parent.clientWidth) && size > 5) {
                 size -= 1;
                 el.style.fontSize = size + '%';
            }
        }

        function openEditModal(pIdx, cIdx, bIdx) {
            editingRef = { pIdx, cIdx, bIdx };
            const block = appState[pIdx][cIdx][bIdx];
            
            document.getElementById('blockType').value = block.type || 'def';
            document.getElementById('blockContent').value = block.content || '';
            
            // Height
            document.getElementById('blockAutoHeight').checked = !!block.autoHeight;
            document.getElementById('blockHeight').value = block.height || '2cm';

            // Font
            document.getElementById('blockFontSize').value = block.manualFontSize || 100;

            // Align
            document.getElementById('blockVAlign').value = block.vAlign || 'center';
            document.getElementById('blockHAlign').value = block.hAlign || 'center';

            document.getElementById('blockImportant').checked = !!block.important;
            
            updateFormFields();
            document.getElementById('editModal').showModal();
        }

        function saveEdit() {
            if (!editingRef) return;
            const { pIdx, cIdx, bIdx } = editingRef;
            
            const type = document.getElementById('blockType').value;
            const content = document.getElementById('blockContent').value;
            const isAutoHeight = document.getElementById('blockAutoHeight').checked;
            const height = document.getElementById('blockHeight').value;
            const fontSize = document.getElementById('blockFontSize').value;
            const vAlign = document.getElementById('blockVAlign').value;
            const hAlign = document.getElementById('blockHAlign').value;
            const important = document.getElementById('blockImportant').checked;

            appState[pIdx][cIdx][bIdx] = {
                type,
                content: type.includes('divider') ? '' : content,
                height: height,
                autoHeight: isAutoHeight,
                manualFontSize: fontSize,
                vAlign,
                hAlign,
                important: type.includes('divider') ? false : important
            };

            saveState();
            renderApp();
            document.getElementById('editModal').close();
            editingRef = null;
        }

        function deleteBlock() {
            if (!editingRef) return;
            const { pIdx, cIdx, bIdx } = editingRef;
            
            if(confirm('Delete this block?')) {
                appState[pIdx][cIdx].splice(bIdx, 1);
                saveState();
                renderApp();
                document.getElementById('editModal').close();
                editingRef = null;
            }
        }

        function addBlock(pIdx, cIdx) {
            const col = appState[pIdx][cIdx];
            if (col.length > 0) {
                 col.push({ type: 'sdivider' });
            }
            col.push({ 
                type: 'def', 
                height: '2cm', 
                content: 'New Block', 
                important: false,
                autoHeight: false,
                manualFontSize: 100,
                vAlign: 'center',
                hAlign: 'center'
            });
            saveState();
            renderApp();
            
            // Automatically open edit for the new block
            openEditModal(pIdx, cIdx, col.length - 1);
        }
