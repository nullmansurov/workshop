// Create a new container on click of the button with id="wikipedia"
document.getElementById('wikipedia').addEventListener('click', function() {
    var editor = document.getElementById('editor');

    // Create a unique ID for each new container
    var uniqueId = 'wiki-search-container-' + Date.now();

    // Create the container
    var wikiContainer = document.createElement('div');
    wikiContainer.id = uniqueId;
    wikiContainer.classList.add("wiki-container");
    
    // Make the container non-editable
    wikiContainer.setAttribute('contenteditable', 'false');

    wikiContainer.innerHTML = `
        <input type="text" class="wiki-search" placeholder="Enter a query">
        <button class="wiki-search-btn">Search</button>
        <div class="wiki-result"></div>
    `;

    // Insert the container into the editor
    editor.appendChild(wikiContainer);
    wikiContainer.scrollIntoView();
    wikiContainer.querySelector('.wiki-search').focus();

    // Start the observer for container removal (e.g., when the button text changes)
    observeWikiContainerRemoval(wikiContainer);
});


// Delegate click on the "Search" button for all containers inside #editor
document.getElementById('editor').addEventListener('click', function(e) {
    if (e.target.classList.contains('wiki-search-btn')) {
        var wikiContainer = e.target.closest('.wiki-container');
        var queryInput = wikiContainer.querySelector('.wiki-search');
        var query = queryInput.value.trim();
        if (!query) return;

        var resultDiv = wikiContainer.querySelector('.wiki-result');
        resultDiv.innerHTML = '🔍 Searching...';

        fetch(`https://ru.wikipedia.org/w/api.php?action=query&prop=extracts&titles=${encodeURIComponent(query)}&exintro&explaintext&format=json&origin=*`)
            .then(response => response.json())
            .then(data => {
                let pages = data.query.pages;
                let pageId = Object.keys(pages)[0];

                if (pageId === "-1") {
                    resultDiv.innerHTML = "<p class='error-msg'>❌ Nothing found.</p>";
                    return;
                }

                let page = pages[pageId];
                let extract = page.extract || "Synopsis is missing.";

                resultDiv.innerHTML = `
                    <p class="wiki-title"><strong>${page.title}</strong></p>
                    <p class="wiki-text">${extract.length > 500 ? extract.substring(0, 500) + "..." : extract}</p>
                    <a class="wiki-link" href="https://ru.wikipedia.org/wiki/${encodeURIComponent(page.title)}" target="_blank">Go to Wikipedia</a>
                `;
            })
            .catch(error => {
                resultDiv.innerHTML = "<p class='error-msg'>⚠️ Error fetching data.</p>";
                console.error(error);
            });
    }
});


// (Optional) Delegate for handling Enter key press in the input field
document.getElementById('editor').addEventListener('keydown', function(e) {
    if (e.target.classList.contains('wiki-search') && e.key === 'Enter') {
        e.preventDefault();
        var wikiContainer = e.target.closest('.wiki-container');
        var query = e.target.value.trim();
        if (!query) return;

        var resultDiv = wikiContainer.querySelector('.wiki-result');
        resultDiv.innerHTML = '🔍 Searching...';

        fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=extracts&titles=${encodeURIComponent(query)}&exintro&explaintext&format=json&origin=*`)
            .then(response => response.json())
            .then(data => {
                let pages = data.query.pages;
                let pageId = Object.keys(pages)[0];

                if (pageId === "-1") {
                    resultDiv.innerHTML = "<p class='error-msg'>❌ Nothing found.</p>";
                    return;
                }

                let page = pages[pageId];
                let extract = page.extract || "Synopsis is missing.";

                resultDiv.innerHTML = `
                    <p class="wiki-title"><strong>${page.title}</strong></p>
                    <p class="wiki-text">${extract.length > 500 ? extract.substring(0, 500) + "..." : extract}</p>
                    <a class="wiki-link" href="https://ru.wikipedia.org/wiki/${encodeURIComponent(page.title)}" target="_blank">Go to Wikipedia</a>
                `;
            })
            .catch(error => {
                resultDiv.innerHTML = "<p class='error-msg'>⚠️ Error fetching data.</p>";
                console.error(error);
            });
    }
});


// Observer for changes in the container.
// If the button text (a utility element) is removed, remove the entire container.
function observeWikiContainerRemoval(container) {
    var target = container.querySelector('.wiki-search-btn');
    var observer = new MutationObserver(function(mutations) {
        if (target.textContent.trim() === '') {
            container.remove();
            observer.disconnect();
        }
    });
    observer.observe(target, { childList: true, subtree: true, characterData: true });
}