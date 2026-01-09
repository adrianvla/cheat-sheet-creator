const STORAGE_KEY = 'paperDesignConfig';
        let appState = [];
        let editingRef = null;

        document.addEventListener('DOMContentLoaded', () => {
            loadState();
            renderApp();
            
            // Set up handlers
            document.getElementById('saveBtn').addEventListener('click', saveEdit);
            document.getElementById('deleteBtn').addEventListener('click', deleteBlock);
            document.getElementById('blockType').addEventListener('change', updateFormFields);
            document.getElementById('blockAutoHeight').addEventListener('change', updateFormFields);
        });

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

                    colData.forEach((blockData, bIdx) => {
                        const el = createBlockElement(blockData);
                        el.onclick = () => openEditModal(pIdx, cIdx, bIdx);
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
