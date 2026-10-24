(() => {
  const form = document.getElementById('complaint-form');
  const errorEl = document.getElementById('error');
  const submitBtn = document.getElementById('submit');
  const previews = document.getElementById('previews');
  const photoHint = document.getElementById('photo-hint');
  const successEl = document.getElementById('success');
  const recipientSelect = document.getElementById('recipient');
  const sendCopy = document.getElementById('sendCopy');
  const repEmail = document.getElementById('repEmail');

  const STORAGE_KEYS = ['repName', 'repEmail', 'accessCode'];
  // Photos are resized in the browser before upload so emails stay small
  // and uploads are quick on mobile data.
  const MAX_DIMENSION = 1600;
  const JPEG_QUALITY = 0.82;

  let photos = []; // { blob, name, url }
  let options = { maxFiles: 5, maxFileSizeMb: 8 };

  const store = {
    get(key) { try { return localStorage.getItem(key) || ''; } catch { return ''; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* ignore */ } },
  };

  function fillSelect(select, values, selected) {
    for (const value of values) {
      const opt = document.createElement('option');
      opt.value = opt.textContent = value;
      if (value === selected) opt.selected = true;
      select.appendChild(opt);
    }
  }

  async function init() {
    for (const key of STORAGE_KEYS) {
      const el = document.getElementById(key);
      if (el) el.value = store.get(key);
    }
    sendCopy.checked = store.get('sendCopy') === 'true';
    try {
      const res = await fetch('api/options');
      options = await res.json();
    } catch {
      showError('Could not reach the server. Check your connection and reload.');
      return;
    }
    fillSelect(document.getElementById('category'), options.problemTypes);
    fillSelect(document.getElementById('priority'), options.priorities, options.defaultPriority);
    if (options.recipients?.length) {
      fillSelect(recipientSelect, options.recipients);
      document.getElementById('recipient-field').hidden = false;
    }
    if (options.copyDomains?.length) {
      document.getElementById('copy-hint').textContent =
        `Saved on this device. Copies can only go to ${options.copyDomains.map((d) => '@' + d).join(' or ')} addresses.`;
    }
    document.getElementById('access-section').hidden = !options.requiresAccessCode;
    updatePhotoHint();
  }

  function updatePhotoHint() {
    photoHint.textContent = `${photos.length} of ${options.maxFiles} photos added.`;
  }

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = !message;
    if (message) errorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|heif)$/i;

  // Some Android gallery apps hand over photos with no MIME type, so fall
  // back to the file extension.
  function isImage(file) {
    return file.type ? file.type.startsWith('image/') : IMAGE_EXT.test(file.name);
  }

  // Older Safari lacks createImageBitmap (or its options), so fall back to
  // decoding through an <img> element, which every browser supports.
  async function decodeImage(file) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* try next */ }
      try { return await createImageBitmap(file); } catch { /* try next */ }
    }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function shrinkImage(file) {
    try {
      const image = await decodeImage(file);
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      image.close?.();
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
      if (blob) return { blob, name: file.name.replace(/\.[^.]+$/, '') + '.jpg' };
    } catch {
      // Browser can't decode this format (e.g. HEIC on some devices): send the original.
    }
    return { blob: file, name: file.name };
  }

  async function addFiles(fileList) {
    showError('');
    for (const file of fileList) {
      if (photos.length >= options.maxFiles) {
        showError(`You can attach up to ${options.maxFiles} photos.`);
        break;
      }
      if (!isImage(file)) {
        showError(`"${file.name}" is not a photo. Choose a JPG, PNG or HEIC image.`);
        continue;
      }
      const { blob, name } = await shrinkImage(file);
      if (!blob.type) {
        showError(`"${file.name}" couldn't be read. Try taking the photo again or choosing a JPG.`);
        continue;
      }
      if (blob.size > options.maxFileSizeMb * 1024 * 1024) {
        showError(`"${file.name}" is too large (max ${options.maxFileSizeMb} MB).`);
        continue;
      }
      photos.push({ blob, name, url: URL.createObjectURL(blob) });
    }
    renderPreviews();
  }

  function renderPreviews() {
    previews.replaceChildren(
      ...photos.map((photo, index) => {
        const li = document.createElement('li');
        const img = document.createElement('img');
        img.src = photo.url;
        img.alt = `Photo ${index + 1}`;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = '×';
        remove.setAttribute('aria-label', `Remove photo ${index + 1}`);
        remove.addEventListener('click', () => {
          URL.revokeObjectURL(photo.url);
          photos.splice(index, 1);
          renderPreviews();
        });
        li.append(img, remove);
        return li;
      })
    );
    updatePhotoHint();
  }

  for (const id of ['camera-input', 'gallery-input']) {
    const input = document.getElementById(id);
    input.addEventListener('change', async () => {
      await addFiles(input.files);
      input.value = '';
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showError('');

    // A copy needs somewhere to go.
    repEmail.required = sendCopy.checked;
    if (!form.checkValidity()) {
      const firstInvalid = form.querySelector(':invalid');
      const label = firstInvalid?.closest('label')?.firstChild?.textContent?.trim().replace(/\s*\*$/, '');
      showError(
        firstInvalid === repEmail && !repEmail.value
          ? 'Enter your email so we can send you a copy.'
          : `Please check: ${label || 'required fields'}.`
      );
      firstInvalid?.focus();
      return;
    }

    const data = new FormData(form);
    const accessCode = data.get('accessCode') || '';
    data.delete('accessCode');
    for (const photo of photos) data.append('photos', photo.blob, photo.name);

    store.set('repName', data.get('repName'));
    store.set('repEmail', data.get('repEmail'));
    store.set('sendCopy', String(sendCopy.checked));

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';
    try {
      const res = await fetch('api/complaints', {
        method: 'POST',
        body: data,
        headers: accessCode ? { 'X-Access-Code': accessCode } : {},
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) document.getElementById('access-section').hidden = false;
        throw new Error(body.error || `Something went wrong (${res.status}).`);
      }
      if (accessCode) store.set('accessCode', accessCode);
      document.getElementById('reference').textContent = body.reference;
      form.hidden = true;
      successEl.hidden = false;
      window.scrollTo({ top: 0 });
    } catch (err) {
      showError(err.message === 'Failed to fetch' ? 'No connection. Your details are still here — try again.' : err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send complaint';
    }
  });

  document.getElementById('new-complaint').addEventListener('click', () => {
    const keep = Object.fromEntries(STORAGE_KEYS.map((k) => [k, document.getElementById(k)?.value || '']));
    form.reset();
    for (const [k, v] of Object.entries(keep)) {
      const el = document.getElementById(k);
      if (el) el.value = v;
    }
    document.getElementById('priority').value = options.defaultPriority;
    sendCopy.checked = store.get('sendCopy') === 'true';
    recipientSelect.value = '';
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    photos = [];
    renderPreviews();
    successEl.hidden = true;
    form.hidden = false;
  });

  init();
})();
