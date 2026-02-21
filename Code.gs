/* ═══════════════════════════════════════════════════
   சாரம் (SARAM) — Google Apps Script Backend v1.0
   Deploy as Web App: Execute as Me, Access: Anyone
   ═══════════════════════════════════════════════════ */

// ── CONFIGURATION ──────────────────────────────────
const SHEET_ID        = 'YOUR_GOOGLE_SHEET_ID_HERE';    // Paste your Google Sheet ID
const GEMINI_API_KEY  = 'YOUR_GEMINI_API_KEY_HERE';     // From aistudio.google.com
const ADMIN_PASSWORD  = 'saram@admin2024';               // Change after first login
const DRIVE_FOLDER    = 'Saram AI Images';               // Auto-created in Drive
const GEMINI_MODEL    = 'gemini-2.5-flash-preview-04-17'; // Current stable model

// ── CORS HEADERS ───────────────────────────────────
function setCorsHeaders(output) {
  return output
    .setMimeType(ContentService.MimeType.JSON)
    .addHeader('Access-Control-Allow-Origin', '*')
    .addHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    .addHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function doOptions(e) {
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT)
    .addHeader('Access-Control-Allow-Origin', '*')
    .addHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    .addHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ── GET HANDLER ────────────────────────────────────
function doGet(e) {
  const action = e.parameter.action || 'healthCheck';
  let result;

  try {
    switch (action) {
      case 'healthCheck':
        result = { status: 'ok', timestamp: new Date().toISOString(), version: '1.0' };
        break;
      case 'getPosts':
        result = { posts: getPosts() };
        break;
      case 'getDailyEvent':
        result = getDailyEvent();
        break;
      case 'getDailyContent':
        result = getDailyContent();
        break;
      case 'getStats':
        result = getStats();
        break;
      case 'getEvents':
        result = { events: getEvents() };
        break;
      default:
        result = { error: 'Unknown action: ' + action };
    }
  } catch (err) {
    result = { error: err.message };
  }

  return setCorsHeaders(
    ContentService.createTextOutput(JSON.stringify(result))
  );
}

// ── POST HANDLER ───────────────────────────────────
function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (_) {
    return setCorsHeaders(
      ContentService.createTextOutput(JSON.stringify({ error: 'Invalid JSON body' }))
    );
  }

  const action   = body.action || '';
  const password = body.password || '';
  let result;

  // Public actions (no auth needed)
  if (action === 'ping') {
    return setCorsHeaders(ContentService.createTextOutput(JSON.stringify({ ok: true })));
  }

  // Auth check for write operations
  if (password !== ADMIN_PASSWORD) {
    return setCorsHeaders(
      ContentService.createTextOutput(JSON.stringify({ error: 'Unauthorized — wrong password' }))
    );
  }

  try {
    switch (action) {
      case 'setupSheets':   result = setupSheets();           break;
      case 'addPost':       result = addPost(body.post);      break;
      case 'updatePost':    result = updatePost(body.post);   break;
      case 'deletePost':    result = deletePost(body.id);     break;
      case 'addEvent':      result = addEvent(body.event);    break;
      case 'updateEvent':   result = updateEvent(body.event); break;
      case 'deleteEvent':   result = deleteEvent(body.id);    break;
      case 'generateImage': result = generateImage(body);     break;
      case 'generateCaption': result = generateCaption(body); break;
      case 'batchImport':   result = batchImport(body.posts); break;
      case 'updateConfig':  result = updateConfig(body.key, body.value); break;
      default:
        result = { error: 'Unknown action: ' + action };
    }
  } catch (err) {
    result = { error: err.message, stack: err.stack };
  }

  return setCorsHeaders(
    ContentService.createTextOutput(JSON.stringify(result))
  );
}

// ══════════════════════════════════════════════════
//  SHEET HELPERS
// ══════════════════════════════════════════════════
function getSheet(name) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Sheet not found: ' + name);
  return sheet;
}

function sheetToObjects(sheet) {
  const [headers, ...rows] = sheet.getDataRange().getValues();
  return rows
    .filter(r => r[0] !== '')
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = r[i]; });
      return obj;
    });
}

// ══════════════════════════════════════════════════
//  POSTS CRUD
// ══════════════════════════════════════════════════
function getPosts() {
  try {
    const sheet = getSheet('posts');
    const data  = sheetToObjects(sheet);
    return data
      .filter(p => p.active === true || p.active === 'TRUE' || p.active === 1)
      .map(p => ({
        id:           Number(p.id),
        type:         p.type || 'text',
        category:     p.category || 'kural',
        title:        p.title || '',
        verse:        p.verse ? String(p.verse).split('||') : [],
        explanation:  p.explanation || '',
        source:       p.source || '',
        image_url:    p.image_url || '',
        gradient_bg:  p.gradient_bg || '',
        tags:         p.tags ? String(p.tags).split(',').map(t => t.trim()) : [],
        likes:        Number(p.likes) || 0,
        saves:        Number(p.saves) || 0,
        ai_generated: p.ai_generated === true || p.ai_generated === 'TRUE',
        date_added:   p.date_added || '',
      }));
  } catch (_) {
    return [];
  }
}

function addPost(post) {
  const sheet   = getSheet('posts');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const nextId  = getNextId('posts');
  const row     = headers.map(h => {
    if (h === 'id')         return nextId;
    if (h === 'active')     return true;
    if (h === 'date_added') return new Date().toISOString().slice(0, 10);
    if (h === 'verse')      return Array.isArray(post.verse) ? post.verse.join('||') : (post.verse || '');
    if (h === 'tags')       return Array.isArray(post.tags) ? post.tags.join(',') : (post.tags || '');
    return post[h] !== undefined ? post[h] : '';
  });
  sheet.appendRow(row);
  return { ok: true, id: nextId };
}

function updatePost(post) {
  const sheet = getSheet('posts');
  const [headers, ...rows] = sheet.getDataRange().getValues();
  const idCol  = headers.indexOf('id');
  const rowIdx = rows.findIndex(r => String(r[idCol]) === String(post.id));
  if (rowIdx === -1) return { error: 'Post not found: ' + post.id };
  const sheetRow = rowIdx + 2; // +1 for header, +1 for 1-index
  headers.forEach((h, i) => {
    if (post[h] !== undefined) {
      let val = post[h];
      if (h === 'verse') val = Array.isArray(val) ? val.join('||') : val;
      if (h === 'tags')  val = Array.isArray(val) ? val.join(',')  : val;
      sheet.getRange(sheetRow, i + 1).setValue(val);
    }
  });
  return { ok: true };
}

function deletePost(id) {
  const sheet = getSheet('posts');
  const [headers, ...rows] = sheet.getDataRange().getValues();
  const idCol  = headers.indexOf('id');
  const rowIdx = rows.findIndex(r => String(r[idCol]) === String(id));
  if (rowIdx === -1) return { error: 'Post not found: ' + id };
  // Soft delete — set active = false
  const activeCol = headers.indexOf('active');
  sheet.getRange(rowIdx + 2, activeCol + 1).setValue(false);
  return { ok: true };
}

function getNextId(sheetName) {
  const sheet = getSheet(sheetName);
  const data  = sheet.getDataRange().getValues();
  if (data.length <= 1) return 1;
  const idCol = data[0].indexOf('id');
  const ids   = data.slice(1).map(r => Number(r[idCol])).filter(n => !isNaN(n));
  return ids.length ? Math.max(...ids) + 1 : 1;
}

// ══════════════════════════════════════════════════
//  EVENTS CRUD
// ══════════════════════════════════════════════════
function getEvents() {
  try {
    const sheet = getSheet('events');
    return sheetToObjects(sheet).filter(
      e => e.active === true || e.active === 'TRUE' || e.active === 1
    );
  } catch (_) { return []; }
}

function addEvent(event) {
  const sheet   = getSheet('events');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row     = headers.map(h => (event[h] !== undefined ? event[h] : ''));
  if (headers.includes('active') && !event.active) {
    row[headers.indexOf('active')] = true;
  }
  sheet.appendRow(row);
  return { ok: true };
}

function updateEvent(event) {
  const sheet = getSheet('events');
  const [headers, ...rows] = sheet.getDataRange().getValues();
  // Match by date + day_of_week
  const rowIdx = rows.findIndex(r =>
    String(r[headers.indexOf('date')]) === String(event.date) &&
    String(r[headers.indexOf('day_of_week')]) === String(event.day_of_week)
  );
  if (rowIdx === -1) return addEvent(event); // Insert if not found
  headers.forEach((h, i) => {
    if (event[h] !== undefined) sheet.getRange(rowIdx + 2, i + 1).setValue(event[h]);
  });
  return { ok: true };
}

function deleteEvent(id) {
  // id = date string e.g. "01-14"
  const sheet = getSheet('events');
  const [headers, ...rows] = sheet.getDataRange().getValues();
  const dateCol  = headers.indexOf('date');
  const activeCol = headers.indexOf('active');
  const rowIdx = rows.findIndex(r => String(r[dateCol]) === String(id));
  if (rowIdx === -1) return { error: 'Event not found' };
  sheet.getRange(rowIdx + 2, activeCol + 1).setValue(false);
  return { ok: true };
}

// ══════════════════════════════════════════════════
//  DAILY EVENT LOGIC
// ══════════════════════════════════════════════════
function getDailyEvent() {
  const now   = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day   = String(now.getDate()).padStart(2, '0');
  const mmdd  = `${month}-${day}`;
  const dow   = now.getDay(); // 0=Sun, 6=Sat

  // 1. Check calendar events sheet
  try {
    const events = getEvents();
    const calEvent = events.find(e => e.date === mmdd);
    if (calEvent) {
      return {
        type:     'calendar',
        date:     mmdd,
        title_ta: calEvent.title_ta || '',
        title_en: calEvent.title_en || '',
        description: calEvent.description || '',
        category: calEvent.category || 'festival',
        ai_prompt: calEvent.ai_prompt || '',
        emoji:    getEventEmoji(calEvent.category),
      };
    }
  } catch (_) {}

  // 2. Day-of-week fallback
  const DOW_MAP = [
    { label:'ஞாயிறு',  deity:'சூரியன்',    category:'bakthi',   desc:'ஞாயிற்றுக்கிழமை — சூரிய வழிபாடு',    prompt:'Sun deity Surya golden temple art' },
    { label:'திங்கள்',  deity:'சிவன்',       category:'bakthi',   desc:'திங்கட்கிழமை — சிவ வழிபாடு',         prompt:'Shiva temple mural blue lotus meditation' },
    { label:'செவ்வாய்', deity:'முருகன்',     category:'bakthi',   desc:'செவ்வாய்க்கிழமை — முருக வழிபாடு',   prompt:'Murugan vel peacock Tamil temple mural' },
    { label:'புதன்',   deity:'விஷ்ணு',      category:'bakthi',   desc:'புதன்கிழமை — விஷ்ணு வழிபாடு',        prompt:'Vishnu lotus Garuda temple mural gold' },
    { label:'வியாழன்', deity:'குரு',         category:'kural',    desc:'வியாழக்கிழமை — ஞான தினம்',           prompt:'Guru teacher wisdom palm leaf manuscript Tamil' },
    { label:'வெள்ளி',  deity:'லட்சுமி',     category:'bakthi',   desc:'வெள்ளிக்கிழமை — லட்சுமி வழிபாடு',   prompt:'Lakshmi lotus gold coins temple art' },
    { label:'சனி',     deity:'அனுமன்',      category:'bakthi',   desc:'சனிக்கிழமை — அனுமன் வழிபாடு',       prompt:'Hanuman devotion Tamil temple mural orange' },
  ];

  const theme = DOW_MAP[dow];
  return {
    type:     'dow',
    date:     mmdd,
    title_ta: theme.label + ' — ' + theme.deity,
    title_en: theme.label,
    description: theme.desc,
    category: theme.category,
    ai_prompt: theme.prompt,
    emoji:    getCatEmoji(theme.category),
  };
}

function getDailyContent() {
  const event = getDailyEvent();
  const posts = getPosts();
  const cat   = event.category || 'kural';
  const catPosts = posts.filter(p => p.category === cat);
  // Pick post based on day-of-year to rotate through
  const doy   = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const post  = catPosts.length ? catPosts[doy % catPosts.length] : (posts[0] || null);
  return { event, post };
}

function getStats() {
  let posts = 0, events = 0, ai = 0;
  try { const data = getPosts(); posts = data.length; ai = data.filter(p => p.ai_generated).length; } catch (_) {}
  try { events = getEvents().length; } catch (_) {}
  const todayEvent = getDailyEvent();
  return { posts, events, ai_images: ai, today: todayEvent };
}

function getEventEmoji(category) {
  const map = { festival:'🎉', kural:'📜', bakthi:'🕉️', paadal:'🎵', oakkam:'⚡', vaazhkai:'🌱',
                architecture:'🏛️', dance:'💃', cuisine:'🍛', temple_art:'🎨' };
  return map[category] || '🪔';
}

function getCatEmoji(cat) { return getEventEmoji(cat); }

// ══════════════════════════════════════════════════
//  CONFIG
// ══════════════════════════════════════════════════
function updateConfig(key, value) {
  const sheet = getSheet('config');
  const data  = sheet.getDataRange().getValues();
  const rowIdx = data.findIndex(r => r[0] === key);
  if (rowIdx === -1) {
    sheet.appendRow([key, value]);
  } else {
    sheet.getRange(rowIdx + 1, 2).setValue(value);
  }
  return { ok: true };
}

function getConfig(key) {
  try {
    const sheet = getSheet('config');
    const data  = sheet.getDataRange().getValues();
    const row   = data.find(r => r[0] === key);
    return row ? row[1] : null;
  } catch (_) { return null; }
}

// ══════════════════════════════════════════════════
//  GEMINI AI — IMAGE GENERATION
// ══════════════════════════════════════════════════
function generateImage(body) {
  const text      = body.text      || '';
  const style     = body.style     || 'Traditional Tamil temple mural';
  const savePost  = body.save_to_post;

  // Build enhanced prompt
  const stylePrompts = {
    'traditional': 'Traditional Tamil temple mural art, warm saffron maroon gold tones, devotional style, intricate border patterns, ancient Indian aesthetic',
    'modern':      'Modern digital Tamil art, clean design, geometric patterns, contemporary Indian illustration, vibrant colors',
    'watercolor':  'Watercolor Tamil art, soft flowing colors, traditional motifs, delicate brush strokes, cultural illustration',
    'minimalist':  'Minimalist Tamil cultural art, simple elegant lines, limited palette of maroon and gold, modern clean aesthetic',
  };
  const styleKey   = Object.keys(stylePrompts).find(k => style.toLowerCase().includes(k)) || 'traditional';
  const styleDesc  = stylePrompts[styleKey];
  const fullPrompt = `${styleDesc}. Subject: ${text}. Square format 1:1, high quality, no text overlays.`;

  // Call Gemini API
  const url     = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const payload = {
    contents: [{ parts: [{ text: fullPrompt }] }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
    },
  };

  const options = {
    method:      'post',
    contentType: 'application/json',
    payload:     JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(url, options);
  const data     = JSON.parse(response.getContentText());

  if (data.error) {
    return { error: data.error.message || 'Gemini API error', details: data.error };
  }

  // Extract image from response
  const parts = (data.candidates?.[0]?.content?.parts) || [];
  const imgPart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));

  if (!imgPart) {
    return { error: 'No image in Gemini response', raw: JSON.stringify(data).slice(0, 500) };
  }

  const base64Data = imgPart.inlineData.data;
  const mimeType   = imgPart.inlineData.mimeType;

  // Save to Google Drive
  const driveUrl = saveImageToDrive(base64Data, mimeType, text.slice(0, 40));

  // Optionally update post image_url
  if (savePost) {
    try {
      updatePost({ id: savePost, image_url: driveUrl, ai_generated: true });
    } catch (_) {}
  }

  return { ok: true, image_url: driveUrl, prompt: fullPrompt };
}

function saveImageToDrive(base64Data, mimeType, name) {
  // Get or create folder
  const folders = DriveApp.getFoldersByName(DRIVE_FOLDER);
  const folder  = folders.hasNext() ? folders.next() : DriveApp.createFolder(DRIVE_FOLDER);

  const filename = `saram_${Date.now()}_${name.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
  const blob     = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, filename);
  const file     = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const fileId = file.getId();
  return `https://lh3.googleusercontent.com/d/${fileId}`;
}

// ══════════════════════════════════════════════════
//  GEMINI AI — CAPTION / TEXT GENERATION
// ══════════════════════════════════════════════════
function generateCaption(body) {
  const verse    = body.verse    || '';
  const category = body.category || 'kural';
  const lang     = body.lang     || 'ta';

  const prompt = lang === 'ta'
    ? `நீங்கள் ஒரு தமிழ் இலக்கிய வல்லுனர். கீழ்க்கண்ட வரிகளுக்கு எளிமையான தமிழ் விளக்கம் எழுதுங்கள் (2-3 வாக்கியங்கள்):\n\n"${verse}"\n\nவிளக்கம்:`
    : `You are an expert in Tamil literature. Write a simple English explanation (2-3 sentences) for:\n\n"${verse}"\n\nExplanation:`;

  const url     = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-04-17:generateContent?key=${GEMINI_API_KEY}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 200, temperature: 0.7 },
  };

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const data   = JSON.parse(response.getContentText());
  if (data.error) return { error: data.error.message };
  const text   = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return { ok: true, caption: text.trim() };
}

// ══════════════════════════════════════════════════
//  BATCH IMPORT
// ══════════════════════════════════════════════════
function batchImport(posts) {
  if (!Array.isArray(posts)) return { error: 'posts must be an array' };
  const sheet   = getSheet('posts');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  let nextId    = getNextId('posts');
  const rows    = [];

  posts.forEach(post => {
    const row = headers.map(h => {
      if (h === 'id')         return post.id || nextId++;
      if (h === 'active')     return true;
      if (h === 'date_added') return new Date().toISOString().slice(0, 10);
      if (h === 'verse')      return Array.isArray(post.verse) ? post.verse.join('||') : (post.verse || '');
      if (h === 'tags')       return Array.isArray(post.tags) ? post.tags.join(',') : (post.tags || '');
      return post[h] !== undefined ? post[h] : '';
    });
    rows.push(row);
  });

  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
  }
  return { ok: true, imported: rows.length };
}

// ══════════════════════════════════════════════════
//  ONE-TIME SETUP
// ══════════════════════════════════════════════════
function setupSheets() {
  const ss = SpreadsheetApp.openById(SHEET_ID);

  // ── posts sheet ──
  let postsSheet = ss.getSheetByName('posts');
  if (!postsSheet) {
    postsSheet = ss.insertSheet('posts');
    postsSheet.appendRow([
      'id','type','category','title','verse','explanation','source',
      'image_url','gradient_bg','tags','likes','saves','active','date_added','ai_generated'
    ]);
    postsSheet.getRange(1, 1, 1, 15).setFontWeight('bold').setBackground('#7B0000').setFontColor('#FDF5E6');
  }

  // ── events sheet ──
  let eventsSheet = ss.getSheetByName('events');
  if (!eventsSheet) {
    eventsSheet = ss.insertSheet('events');
    eventsSheet.appendRow([
      'date','day_of_week','title_ta','title_en','description','category','ai_prompt','active'
    ]);
    eventsSheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#7B0000').setFontColor('#FDF5E6');

    // Seed Tamil calendar events
    const events = [
      ['01-14','','தை பொங்கல்','Thai Pongal','அறுவடை திருவிழா — நன்றி கூறும் நாள்','festival','Pongal harvest festival Tamil Nadu, cow decorated, sugarcane, kolam rangoli, traditional temple art',true],
      ['01-15','','மாட்டுப் பொங்கல்','Mattu Pongal','மாடுகளை வழிபடும் திருவிழா','festival','Mattu Pongal decorated cattle Tamil village festival traditional art',true],
      ['01-16','','காணும் பொங்கல்','Kaanum Pongal','குடும்பத்தினர் சந்திக்கும் நாள்','vaazhkai','Tamil family gathering traditional kolam festival day art',true],
      ['04-14','','தமிழ் புத்தாண்டு','Tamil New Year','புத்தாண்டு வாழ்த்துக்கள் — சித்திரை மாதம் தொடக்கம்','kural','Tamil New Year celebration Chithirai traditional temple mural gold maroon',true],
      ['10-02','','நவராத்திரி','Navarathri','தெய்வீக சக்தியை வழிபடும் ஒன்பது நாள் திருவிழா','bakthi','Navarathri Durga Saraswati Lakshmi Tamil festival traditional mural',true],
      ['11-15','','கார்த்திகை தீபம்','Karthigai Deepam','தீப ஒளி திருவிழா — கார்த்திகை பவுர்ணமி','bakthi','Karthigai Deepam oil lamps fire festival Tiruvannamalai Tamil devotional art',true],
      ['12-16','','மார்கழி','Margazhi','திருவெம்பாவை பாடும் புனிதமான மாதம்','paadal','Margazhi morning devotion Andal Tiruppavai Tamil music traditional art',true],
      ['12-25','','கிறிஸ்துமஸ்','Christmas','அன்பும் மகிழ்ச்சியும் நிறைந்த கிறிஸ்துமஸ்','vaazhkai','Christmas joy love peace multicultural Tamil inclusive art',true],
      ['01-01','','புத்தாண்டு','New Year','புத்தாண்டு நல் வாழ்த்துகள்!','oakkam','New Year celebration fireworks joy hope Tamil art',true],
      ['08-15','','சுதந்திர தினம்','Independence Day','தாய்நாட்டுக்கு வணக்கம்','oakkam','India Independence Day tricolor flag Tamil Nadu traditional art',true],
    ];
    events.forEach(row => eventsSheet.appendRow(row));
  }

  // ── config sheet ──
  let configSheet = ss.getSheetByName('config');
  if (!configSheet) {
    configSheet = ss.insertSheet('config');
    configSheet.appendRow(['key','value']);
    configSheet.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#7B0000').setFontColor('#FDF5E6');
    [
      ['site_name',       'சாரம்'],
      ['gemini_model',    GEMINI_MODEL],
      ['image_style',     'traditional'],
      ['posts_per_page',  '6'],
      ['version',         '1.0'],
    ].forEach(row => configSheet.appendRow(row));
  }

  return {
    ok: true,
    message: 'Sheets created successfully',
    sheets: ['posts', 'events', 'config']
  };
}
