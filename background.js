const FOLDER_NAME = 'Where Was I';
let whereWasIFolderId = null;

function initExtension() {
  chrome.bookmarks.search({ title: FOLDER_NAME }, (results) => {
    if (results.length === 0) {
      chrome.bookmarks.create({ 
        parentId: "1",
        title: FOLDER_NAME 
      }, (folder) => {
        whereWasIFolderId = folder.id;
        console.log(`Created ${FOLDER_NAME} folder with ID: ${whereWasIFolderId}`);
        chrome.storage.local.set({ whereWasIFolderId: whereWasIFolderId });
      });
    } else {
      whereWasIFolderId = results[0].id;
      console.log(`Found existing ${FOLDER_NAME} folder with ID: ${whereWasIFolderId}`);
      
      chrome.bookmarks.get(whereWasIFolderId, (bookmarkItems) => {
        if (bookmarkItems && bookmarkItems.length > 0 && bookmarkItems[0].parentId !== "1") {
          chrome.bookmarks.move(whereWasIFolderId, { parentId: "1" }, (movedBookmark) => {
            console.log(`Moved ${FOLDER_NAME} folder to bookmarks bar`);
          });
        }
      });
      
      chrome.storage.local.set({ whereWasIFolderId: whereWasIFolderId });
    }
  });
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('welcome.html')
    });
  }
});

// Listen for extension icon clicks - open the welcome page
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('welcome.html')
  });
});

// Check if a URL is likely an episode from a series
function isSeriesEpisode(url) {
  const episodePatterns = [
    /episode[=\/-](\d+)/i,     // matches episode=12, episode-12, episode/12
    /ep[=\/-](\d+)/i,          // matches ep=12, ep-12, ep/12
    /e(\d+)/i,                 // matches E12, e12
    /season[=\/-](\d+)/i,      // matches season identifiers
    /s(\d+)e(\d+)/i,           // matches S01E12 format
    /\/(series|show)\/[^\/]+\/(\d+)/i,  // matches /series/name/12 or /show/name/12
    /\/watch-[^\/]+\d+\.(\d+)$/i,       // matches numeric ID patterns
    /\/[^\/]+-\d+\/[^\/]+-(\d+)/i       // matches another common format with numeric IDs
  ];
  
  return episodePatterns.some(pattern => pattern.test(url));
}

// Extract the series name from the URL and title
function extractSeriesInfo(url, title) {
  let seriesName = "";
  let episodeNumber = "";
  
  const episodePatterns = [
    { pattern: /episode[=\/-](\d+)/i, group: 1 },
    { pattern: /ep[=\/-](\d+)/i, group: 1 },
    { pattern: /e(\d+)/i, group: 1 },
    { pattern: /s(\d+)e(\d+)/i, group: 2 },
    { pattern: /\/(series|show)\/[^\/]+\/(\d+)/i, group: 2 },
    { pattern: /\/watch-[^\/]+\d+\.(\d+)$/i, group: 1 },
    { pattern: /\/[^\/]+-\d+\/[^\/]+-(\d+)/i, group: 1 }
  ];
  
  for (const { pattern, group } of episodePatterns) {
    const match = url.match(pattern);
    if (match && match[group]) {
      episodeNumber = match[group];
      break;
    }
  }
  
  if (!episodeNumber) {
    const titleEpisodePatterns = [
      /episode\s+(\d+)/i,
      /ep\s+(\d+)/i,
      /e(\d+)/i,
      /\s+#(\d+)/i,
      /\s+(\d+)$/
    ];
    
    for (const pattern of titleEpisodePatterns) {
      const match = title.match(pattern);
      if (match && match[1]) {
        episodeNumber = match[1];
        break;
      }
    }
  }
  
  const showUrlMatch = url.match(/\/watch-([^\/]+)-\d+\.\d+$/i);
  if (showUrlMatch && showUrlMatch[1]) {
    seriesName = showUrlMatch[1].replace(/-/g, ' ');
  } else {
    
    seriesName = title
      .replace(/\s*[-–|]\s*episode\s+\d+/i, '')
      .replace(/\s*[-–|]\s*ep\s+\d+/i, '')
      .replace(/\s*[-–|]\s*e\d+/i, '')
      .replace(/\s*[-–|]\s*#\d+/i, '')
      .replace(/\s*[-–|]\s*\d+$/i, '')
      .replace(/\s*season\s+\d+/i, '')
      .replace(/\s*s\d+e\d+/i, '')
      .trim();
  }
  
  let domain = '';
  try {
    const urlObj = new URL(url);
    domain = urlObj.hostname.replace('www.', '');
  } catch (e) {
    console.error('Error parsing URL:', e);
  }
  
  return {
    seriesName,
    episodeNumber,
    domain,
    fullUrl: url,
    fullTitle: title
  };
}

// Find related bookmarks for a series
function findRelatedBookmarks(seriesInfo, allBookmarks) {
  if (!seriesInfo.seriesName) return [];
  
  return allBookmarks.filter(bookmark => {
    if (bookmark.url === seriesInfo.fullUrl) return false;
    
    const bookmarkInfo = extractSeriesInfo(bookmark.url, bookmark.title);
    
    const sameDomain = bookmarkInfo.domain === seriesInfo.domain;
    
    const seriesNameA = seriesInfo.seriesName.toLowerCase();
    const seriesNameB = bookmarkInfo.seriesName.toLowerCase();
    
    const isSimilarName = 
      seriesNameA.includes(seriesNameB) || 
      seriesNameB.includes(seriesNameA) ||
      seriesNameA === seriesNameB;
    
    return sameDomain && isSimilarName && isSeriesEpisode(bookmark.url);
  });
}

// Listen for bookmark creation events
chrome.bookmarks.onCreated.addListener((id, bookmark) => {
  handleBookmarkChange(id, bookmark);
});

// Listen for bookmark update events
chrome.bookmarks.onChanged.addListener((id, changeInfo) => {
  chrome.bookmarks.get(id, (bookmarks) => {
    if (bookmarks.length > 0) {
      handleBookmarkChange(id, bookmarks[0]);
    }
  });
});

// Listen for bookmark moves
chrome.bookmarks.onMoved.addListener((id, moveInfo) => {
  chrome.bookmarks.get(id, (bookmarks) => {
    if (bookmarks.length > 0) {
      handleBookmarkChange(id, bookmarks[0]);
    }
  });
});

// Listen for bookmark removal events
chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
  console.log(`Bookmark removed with ID: ${id}`);
  
  if (id === whereWasIFolderId) {
    console.log(`${FOLDER_NAME} folder was deleted, recreating it...`);
    
    chrome.bookmarks.create({ 
      parentId: "1",
      title: FOLDER_NAME 
    }, (folder) => {
      whereWasIFolderId = folder.id;
      console.log(`Recreated ${FOLDER_NAME} folder with ID: ${whereWasIFolderId}`);
      
      chrome.storage.local.set({ whereWasIFolderId: whereWasIFolderId });
      
      chrome.tabs.create({
        url: chrome.runtime.getURL('welcome.html') + '?folderRecreated=true'
      });
    });
  }
});

// Handle bookmark changes
function handleBookmarkChange(id, bookmark) {
  chrome.bookmarks.get(bookmark.parentId, (parents) => {
    if (parents.length > 0 && parents[0].id === whereWasIFolderId) {
      
      if (isSeriesEpisode(bookmark.url)) {
        chrome.bookmarks.getChildren(whereWasIFolderId, (allBookmarks) => {
          const seriesInfo = extractSeriesInfo(bookmark.url, bookmark.title);
          
          const relatedBookmarks = findRelatedBookmarks(seriesInfo, allBookmarks);
          
          if (relatedBookmarks.length > 0) {
            console.log(`Found ${relatedBookmarks.length} related bookmarks for ${seriesInfo.seriesName}`);
            
            relatedBookmarks.sort((a, b) => {
              const aInfo = extractSeriesInfo(a.url, a.title);
              const bInfo = extractSeriesInfo(b.url, b.title);
              return parseInt(aInfo.episodeNumber || 0) - parseInt(bInfo.episodeNumber || 0);
            });
            
            for (const oldBookmark of relatedBookmarks) {
              console.log(`Removing older episode: ${oldBookmark.title}`);
              chrome.bookmarks.remove(oldBookmark.id);
            }
          }
        });
      }
      
      const seriesInfo = isSeriesEpisode(bookmark.url) ? 
        extractSeriesInfo(bookmark.url, bookmark.title) : null;
      
      const bookmarkMeta = {
        id: bookmark.id,
        url: bookmark.url,
        title: bookmark.title,
        seriesInfo: seriesInfo,
        lastSaved: Date.now()
      };
      
      const key = `bookmark_${bookmark.id}`;
      chrome.storage.local.set({ [key]: bookmarkMeta });
    }
  });
}

initExtension();

// Listen for storage changes to update the folder ID if needed
chrome.storage.local.get('whereWasIFolderId', (data) => {
  if (data.whereWasIFolderId) {
    whereWasIFolderId = data.whereWasIFolderId;
  }
}); 