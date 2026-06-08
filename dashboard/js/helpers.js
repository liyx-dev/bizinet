// ================================================================
//  BiziNet · Global Helpers
//  dashboard/js/helpers.js
// ================================================================

// ── Toast notification
window.toast = function (msg, type = "success", duration = 4000) {
  const div = document.createElement("div");
  div.className = `toast ${type}`;
  div.textContent = msg;
  document.body.appendChild(div);
  requestAnimationFrame(() => div.classList.add("show"));
  setTimeout(() => {
    div.classList.remove("show");
    setTimeout(() => div.remove(), 300);
  }, duration);
};

// ── Image optimiser 
window.optimizeImage = function (file) {
  return new Promise((resolve, reject) => {
    const img    = new Image();
    const reader = new FileReader();
    reader.onload  = e => { img.src = e.target.result; };
    reader.onerror = reject;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const MAX    = 1200;
      const scale  = Math.min(1, MAX / Math.max(img.width, img.height));
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        if (!blob) return reject(new Error("Image compression failed."));
        resolve(new File([blob], file.name.replace(/\.\w+$/, ".webp"), { type: "image/webp" }));
      }, "image/webp", 0.70);
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
};
