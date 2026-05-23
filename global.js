// global.js
function safeNavigate(targetPath) {
  const cleanTarget = targetPath.startsWith('/') ? targetPath.substring(1) : targetPath;
  const depth = window.location.pathname.split('/').filter(p => p.length > 0).length;
  const isGitHubPages = window.location.hostname.includes('github.io');
  let prefix = '';
  if (depth > (isGitHubPages ? 2 : 1)) {
    prefix = '../'.repeat(depth - (isGitHubPages ? 2 : 1));
  }
  window.location.replace(window.location.origin + (isGitHubPages ? '/' + window.location.pathname.split('/')[1] : '') + '/' + cleanTarget);
}
