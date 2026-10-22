// Interface texts of the mgr-nx-deko installer (English, Vietnamese). Works in the page and in the worker (no DOM).
// Static texts in index.html name their key with data-i18n (plain text) or data-i18n-html (text with markup).

export const LANGUAGES = [
  { code: 'en', name: 'English', flag: 'uk' },
  { code: 'vi', name: 'Tiếng Việt', flag: 'vietnam' },
];

const SPHAIRA = '<a href="https://github.com/NaGaa95/sphaira/releases" target="_blank" rel="noopener">Sphaira</a>';
const XISO = '<a href="https://github.com/XboxDev/extract-xiso/releases" target="_blank" rel="noopener">github.com/XboxDev/extract-xiso</a>';

const TEXTS = {
  en: {
    legal:
      'Metal Gear Rising: Revengeance is a trademark of Konami Digital Entertainment. mgr-nx-deko is an unofficial fan project and is not affiliated with, endorsed or sponsored by Konami, PlatinumGames, Nintendo or Microsoft. Nintendo Switch is a trademark of Nintendo; Xbox 360 is a trademark of Microsoft. This site does not host or distribute game data or the original game executable: your game is read only inside your browser, is never uploaded, and its files are copied straight into the mgr-nx-deko.zip saved on your computer. You need your own legally obtained copy of the game.',
    sourceCode: 'Source code',
    signature: 'mgr-nx-deko',
    lead:
      'Builds the <strong>Nintendo Switch</strong> package of <strong>Metal Gear Rising: Revengeance</strong> from your own ' +
      '<strong>Xbox 360</strong> copy. Everything runs in <strong>this browser</strong>.',
    languageBar: 'Language',
    step1: '1. Choose your game',
    formatPackage: 'Package file',
    formatFolder: 'Folder',
    ownCopy:
      '<strong>Important:</strong> you need your own copy of the game. The installer reads the game from it to make the package; without it, it cannot be made. Every game file in the package comes from your copy: the installer does not supply any of its own.',
    formatHint:
      '<strong>Folder:</strong> the folder you extracted the game disc into: it holds <code>default.xex</code> and <code>media/</code> ' +
      '(<code>media/data000.cpk</code>, <code>media/data001.cpk</code>, <code>movie</code>, <code>movie_ui</code>, <code>sound</code>). ' +
      'Only have a disc image (<code>.iso</code>)? See below.',
    isoGuideTitle: 'How do I extract the ISO of my disc?',
    isoGuide:
      '<p>An Xbox 360 disc image is not an ordinary ISO: <strong>7-Zip and WinRAR cannot open it</strong>. Use ' +
      `<strong>extract-xiso</strong> (${XISO}). It is a command-line program with no window: double-clicking it only ` +
      'flashes a black window that closes at once.</p>' +
      '<ol>' +
      '<li>Download the Windows build from its Releases page (<code>extract-xiso-Win64_Release.zip</code>) and ' +
      '<strong>extract the zip first</strong> (right-click → <em>Extract All</em>). Do not run it from inside the zip.</li>' +
      '<li><strong>Easiest:</strong> drag your <code>.iso</code> file and drop it <strong>onto the icon</strong> of ' +
      '<code>extract-xiso.exe</code> (not into the window: Windows would copy the ISO into the folder). A black window ' +
      'works for a few minutes and makes a folder named after the ISO.</li>' +
      '<li><strong>Or with a command</strong> (PowerShell), to choose where it goes:<br>' +
      '<code>&amp; "C:\\path\\to\\extract-xiso.exe" -x "D:\\Games\\Metal Gear Rising.iso" -d "D:\\MGR_game"</code></li>' +
      '<li>Check the result: the folder holds <code>default.xex</code> and <code>media</code>. Choose that folder ' +
      'with the <strong>Folder</strong> button above.</li>' +
      '</ol>' +
      '<p>You need about 8 GB free. If Windows says "Windows protected your PC", choose <em>More info</em> → ' +
      '<em>Run anyway</em>. Use the image of your own disc.</p>',
    nothingChosen: 'Nothing chosen yet.',
    chosenGame: 'Game: {name} ({size})',
    chosenDlc: 'DLC: {name} ({size})',
    chosenNoDlc: '',
    step2: '2. Create the package',
    step2First: 'If you are installing the game for the first time, use:',
    create: 'Create mgr-nx-deko.zip',
    step2Update:
      'If the game is already installed and you only want to update it (<code>mgr.nro</code> and the shaders; your <code>mgr.toml</code> stays), use:',
    createUpdate: 'Create mgr-nx-deko-update.zip',
    step3: '3. Copy it to the Switch',
    step3Extract:
      'Extract the downloaded zip into the root of the SD card: it makes <code>sdmc:/switch/mgr-nx-deko/</code> (about 7.5 GB).',
    step3Start:
      'Start <strong>Metal Gear Rising deko3d</strong> from the Homebrew Menu in title takeover mode (<strong>launch</strong> a game installed on the Switch ' +
      `<strong>while holding R</strong>) or create a <strong>39-bit forwarder</strong> with ${SPHAIRA}. The album applet does not give the game enough memory.`,
    step3First:
      'The first start compiles every shader for the console behind a progress screen (a few minutes, once); after that the game starts at once and never compiles while you play.',
    checking: 'Checking your game…',
    supported: 'Xbox 360 · supported',
    supportedWithDlc: 'Xbox 360 · supported',
    unsupported: 'This version of the game is not supported yet.',
    notGame: 'Not the game',
    noGame: 'The game was not found: choose the folder with default.xex and media/.',
    otherTitle: '{name} is not Metal Gear Rising: Revengeance.',
    noStreaming: 'this browser window cannot stream downloads. Use a normal (not private) window.',
    downloadStarted: 'Download started ({size}). Keep this page open until it finishes.',
    finished: 'Finished in {seconds} s.',
    error: 'Error: {message}',
    cancelled: 'the download was cancelled',
    readingFiles: 'Reading your game',
    downloadingBuild: 'Downloading the Switch build',
    logBuild: 'Supported: Metal Gear Rising: Revengeance for Xbox 360 (build {version})',
    logUpdate: 'Update package: mgr.nro and the shaders',
    logDlc: 'DLC: {name}',
    readingShaders: "Reading the game's shaders from media/data000.cpk",
    deko3dShaders: "Making the deko3d renderer's shaders from the game's {count}",
    deko3dReady: 'deko3d shaders ready: they match the tested ones',
    packing: 'Writing the package',
    done: 'Done: extract the zip into the root of the SD card',
    notSupportedYet: 'this version of the game is not supported yet. Executable fingerprint: {hash}',
    buildMismatch: 'the downloaded Switch build is not the published one ({hash}); try again later',
    deko3dContainers: "the game's shaders were not all found ({found} of {wanted}); nothing was written",
    deko3dMismatch: 'the deko3d shaders do not match the tested ones ({hash}); nothing was written',
    noShaderArchive: 'media/data000.cpk is missing from your game folder',
    incompleteGame: 'Incomplete game: {count} of {expected} files. Only the update package can be made.',
    incompleteError: 'the game is incomplete ({count} of {expected} files): choose the whole game',
    downloadFailed: 'could not download {url} ({status})',
  },
  vi: {
    legal:
      'Metal Gear Rising: Revengeance là thương hiệu của Konami Digital Entertainment. mgr-nx-deko là dự án không chính thức của người hâm mộ, không liên kết và không được Konami, PlatinumGames, Nintendo hay Microsoft bảo trợ. Nintendo Switch là thương hiệu của Nintendo; Xbox 360 là thương hiệu của Microsoft. Trang này không lưu trữ hay phân phối dữ liệu game hoặc file chạy gốc của game: game của bạn chỉ được đọc trong trình duyệt, không bao giờ được tải lên, và các file được chép thẳng vào mgr-nx-deko.zip lưu trên máy bạn. Bạn cần bản game của chính mình, có được một cách hợp pháp.',
    sourceCode: 'Mã nguồn',
    signature: 'mgr-nx-deko',
    lead:
      'Tạo gói <strong>Nintendo Switch</strong> của <strong>Metal Gear Rising: Revengeance</strong> từ bản ' +
      '<strong>Xbox 360</strong> của chính bạn. Mọi thứ chạy <strong>trong trình duyệt này</strong>.',
    languageBar: 'Ngôn ngữ',
    step1: '1. Chọn game',
    formatPackage: 'File gói',
    formatFolder: 'Thư mục',
    ownCopy:
      '<strong>Quan trọng:</strong> bạn cần bản game của chính mình. Trang cài đọc game từ đó để tạo gói; không có thì không tạo được. Mọi file game trong gói đều lấy từ bản của bạn: trang cài không cung cấp file game nào.',
    formatHint:
      '<strong>Thư mục:</strong> thư mục bạn đã giải nén đĩa game ra, có <code>default.xex</code> và <code>media/</code> ' +
      '(<code>media/data000.cpk</code>, <code>media/data001.cpk</code>, <code>movie</code>, <code>movie_ui</code>, <code>sound</code>). ' +
      'Chỉ có file ảnh đĩa (<code>.iso</code>)? Xem hướng dẫn bên dưới.',
    isoGuideTitle: 'Giải nén file ISO của đĩa game thế nào?',
    isoGuide:
      '<p>File ảnh đĩa Xbox 360 không phải ISO thường: <strong>7-Zip và WinRAR không mở được</strong>. Hãy dùng ' +
      `<strong>extract-xiso</strong> (${XISO}). Đây là chương trình dòng lệnh, không có giao diện: bấm đúp vào nó chỉ ` +
      'thấy cửa sổ đen hiện lên rồi tắt ngay, không phải lỗi.</p>' +
      '<ol>' +
      '<li>Tải bản Windows ở trang Releases (<code>extract-xiso-Win64_Release.zip</code>) và <strong>giải nén file zip ' +
      'ra trước</strong> (chuột phải → <em>Extract All</em>). Đừng chạy nó khi còn ở trong file zip.</li>' +
      '<li><strong>Dễ nhất:</strong> kéo file <code>.iso</code> thả <strong>lên biểu tượng</strong> ' +
      '<code>extract-xiso.exe</code> (không thả vào khoảng trống của cửa sổ: Windows sẽ chép ISO vào thư mục). Cửa sổ ' +
      'đen chạy vài phút và tạo ra một thư mục mang tên ISO.</li>' +
      '<li><strong>Hoặc bằng lệnh</strong> (PowerShell), để chọn nơi xuất:<br>' +
      '<code>&amp; "C:\\duong-dan\\extract-xiso.exe" -x "D:\\Games\\Metal Gear Rising.iso" -d "D:\\MGR_game"</code></li>' +
      '<li>Kiểm tra: thư mục có <code>default.xex</code> và <code>media</code>. Chọn thư mục đó bằng nút ' +
      '<strong>Thư mục</strong> ở trên.</li>' +
      '</ol>' +
      '<p>Cần khoảng 8 GB trống. Nếu Windows báo "Windows protected your PC", chọn <em>More info</em> → ' +
      '<em>Run anyway</em>. Hãy dùng ảnh đĩa của chính đĩa game bạn sở hữu.</p>',
    nothingChosen: 'Chưa chọn gì.',
    chosenGame: 'Game: {name} ({size})',
    chosenDlc: 'DLC: {name} ({size})',
    chosenNoDlc: '',
    step2: '2. Tạo gói',
    step2First: 'Nếu cài game lần đầu, dùng:',
    create: 'Tạo mgr-nx-deko.zip',
    step2Update:
      'Nếu game đã cài và bạn chỉ muốn cập nhật (<code>mgr.nro</code> và shader; <code>mgr.toml</code> của bạn được giữ nguyên), dùng:',
    createUpdate: 'Tạo mgr-nx-deko-update.zip',
    step3: '3. Chép vào Switch',
    step3Extract:
      'Giải nén file zip vừa tải vào gốc thẻ SD: sẽ có thư mục <code>sdmc:/switch/mgr-nx-deko/</code> (khoảng 7,5 GB).',
    step3Start:
      'Mở <strong>Metal Gear Rising deko3d</strong> từ Homebrew Menu ở chế độ title takeover (<strong>giữ R</strong> trong lúc ' +
      `<strong>mở</strong> một game đã cài trên Switch) hoặc tạo <strong>forwarder 39-bit</strong> bằng ${SPHAIRA}. Applet album không đủ bộ nhớ cho game.`,
    step3First:
      'Lần đầu mở, game biên dịch toàn bộ shader cho máy sau một màn hình tiến trình (vài phút, chỉ một lần); sau đó game vào ngay và không biên dịch gì khi đang chơi.',
    checking: 'Đang kiểm tra game…',
    supported: 'Xbox 360 · được hỗ trợ',
    supportedWithDlc: 'Xbox 360 · được hỗ trợ',
    unsupported: 'Phiên bản game này chưa được hỗ trợ.',
    notGame: 'Không phải game',
    noGame: 'Không tìm thấy game: hãy chọn thư mục có default.xex và media/.',
    otherTitle: '{name} không phải Metal Gear Rising: Revengeance.',
    noStreaming: 'cửa sổ trình duyệt này không tải dạng luồng được. Hãy dùng cửa sổ thường (không phải ẩn danh).',
    downloadStarted: 'Đã bắt đầu tải ({size}). Giữ trang này mở cho tới khi xong.',
    finished: 'Xong trong {seconds} giây.',
    error: 'Lỗi: {message}',
    cancelled: 'đã huỷ tải',
    readingFiles: 'Đang đọc game của bạn',
    downloadingBuild: 'Đang tải bản Switch',
    logBuild: 'Được hỗ trợ: Metal Gear Rising: Revengeance cho Xbox 360 (bản {version})',
    logUpdate: 'Gói cập nhật: mgr.nro và shader',
    logDlc: 'DLC: {name}',
    readingShaders: 'Đang đọc shader của game từ media/data000.cpk',
    deko3dShaders: 'Đang tạo shader cho renderer deko3d từ {count} shader của game',
    deko3dReady: 'Shader deko3d đã sẵn sàng: khớp với bản đã kiểm thử',
    packing: 'Đang ghi gói',
    done: 'Xong: giải nén zip vào gốc thẻ SD',
    notSupportedYet: 'phiên bản game này chưa được hỗ trợ. Dấu vân tay file chạy: {hash}',
    buildMismatch: 'bản Switch tải về không phải bản đã phát hành ({hash}); hãy thử lại sau',
    deko3dContainers: 'không tìm đủ shader của game ({found} trên {wanted}); chưa ghi gì',
    deko3dMismatch: 'shader deko3d không khớp bản đã kiểm thử ({hash}); chưa ghi gì',
    noShaderArchive: 'thư mục game thiếu media/data000.cpk',
    incompleteGame: 'Game chưa đủ: {count} trên {expected} file. Chỉ tạo được gói cập nhật.',
    incompleteError: 'game chưa đủ ({count} trên {expected} file): hãy chọn toàn bộ game',
    downloadFailed: 'không tải được {url} ({status})',
  },
};

let current = 'en';

export function getLanguage() {
  return current;
}

export function setLanguage(code) {
  current = TEXTS[code] ? code : 'en';
  return current;
}

// The visitor's choice (saved in their browser), else the browser's language when it is one of ours, else English.
export function preferredLanguage(saved, browser = []) {
  if (saved && TEXTS[saved]) {
    return saved;
  }
  for (const tag of browser) {
    const code = String(tag).toLowerCase().split('-')[0];
    if (TEXTS[code]) {
      return code;
    }
  }
  return 'en';
}

export function t(key, params = {}) {
  const text = TEXTS[current][key] ?? TEXTS.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, name) => (params[name] ?? `{${name}}`));
}

// Sizes as Windows Explorer shows them, so the page and the file's properties agree: units of 1024 bytes (which
// Windows calls KB, MB and GB) and three significant digits, truncated. 7,834,892,288 bytes is 7.29 GB, not 7.83.
const SIZE_UNITS = { fr: ['Ko', 'Mo', 'Go'] };

export function formatSize(bytes) {
  const units = SIZE_UNITS[current] ?? ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const decimals = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  const scale = 10 ** decimals;
  // The small epsilon keeps values such as 7.3 from becoming 7.29 through floating point.
  const shown = Math.floor(value * scale + 1e-9) / scale;
  const number = new Intl.NumberFormat(current, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${number.format(shown)} ${units[unit]}`;
}
