import { Capacitor, registerPlugin } from '@capacitor/core';

export const CURRENT_APP_VERSION = '1.4.5';
export const CURRENT_APP_BUILD_DATE = 'October 11, 2026';
export const GITHUB_RELEASES_URL = 'https://api.github.com/repos/Charan610/APY/releases/latest';

/**
 * Compares two semantic version strings (e.g. "1.2.1" vs "1.2.0", "v1.2.0" vs "1.2.0").
 * Returns:
 *   1 if v1 > v2 (v1 is newer)
 *  -1 if v1 < v2 (v2 is newer)
 *   0 if v1 === v2
 */
export function compareVersions(v1, v2) {
  const clean1 = (v1 || '').replace(/^v/i, '').trim();
  const clean2 = (v2 || '').replace(/^v/i, '').trim();

  const parts1 = clean1.split('.').map(n => parseInt(n, 10) || 0);
  const parts2 = clean2.split('.').map(n => parseInt(n, 10) || 0);

  const len = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < len; i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

/**
 * Queries GitHub REST API for the latest published release of APY.
 * Silent and non-blocking with local caching and fast 3.5s timeout.
 */
export async function checkForAppUpdate(force = false) {
  try {
    const cacheKey = 'apy_update_check_cache';
    const cached = localStorage.getItem(cacheKey);
    const now = Date.now();

    // Avoid hitting GitHub API rate limits on every render (5 min cooldown unless forced)
    if (!force && cached) {
      try {
        const parsed = JSON.parse(cached);
        if (now - parsed.timestamp < 5 * 60 * 1000 && parsed.data && parsed.data.currentVersion === CURRENT_APP_VERSION) {
          return parsed.data;
        }
      } catch (e) {}
    }

    let releaseData = null;

    // 1. Try GitHub releases API first
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const response = await fetch(GITHUB_RELEASES_URL, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const release = await response.json();
        const latestTag = release.tag_name || release.name || '';
        let apkUrl = null;
        if (Array.isArray(release.assets)) {
          const apkAsset = release.assets.find(a => a.name && a.name.toLowerCase().endsWith('.apk'));
          if (apkAsset) {
            apkUrl = apkAsset.browser_download_url;
          }
        }
        if (!apkUrl && release.html_url) {
          apkUrl = `${release.html_url}/download/APY.apk`;
        }
        releaseData = {
          latestTag,
          releaseName: release.name || latestTag,
          releaseNotes: release.body || '',
          publishedAt: release.published_at,
          apkUrl,
          htmlUrl: release.html_url
        };
      }
    } catch (ghErr) {
      console.warn('GitHub update check note:', ghErr);
    }

    // 2. Fallback to backend /api/notifications/latest-apk if GitHub unreachable or rate limited
    if (!releaseData) {
      try {
        const backendBase = (typeof window !== 'undefined' && window.__BACKEND_URL__) 
          || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) 
          || '';
        const apiResp = await fetch(`${backendBase}/api/notifications/latest-apk`, {
          headers: { 'Accept': 'application/json' }
        });
        if (apiResp.ok) {
          const bk = await apiResp.json();
          if (bk?.version) {
            releaseData = {
              latestTag: `v${bk.version}`,
              releaseName: `APY v${bk.version}`,
              releaseNotes: bk.release_notes || '',
              publishedAt: bk.published_at,
              apkUrl: bk.apk_url || `https://github.com/Charan610/APY/releases/download/v${bk.version}/APY.apk`,
              htmlUrl: `https://github.com/Charan610/APY/releases/tag/v${bk.version}`
            };
          }
        }
      } catch (bkErr) {
        console.warn('Backend update check note:', bkErr);
      }
    }

    if (!releaseData) {
      return {
        hasUpdate: false,
        isUpToDate: true,
        currentVersion: CURRENT_APP_VERSION,
        latestVersion: CURRENT_APP_VERSION,
        releaseNotes: '',
        apkUrl: null
      };
    }

    const latestTag = releaseData.latestTag || '';
    const isNewer = compareVersions(latestTag, CURRENT_APP_VERSION) > 0;

    const result = {
      hasUpdate: isNewer,
      isUpToDate: !isNewer,
      currentVersion: CURRENT_APP_VERSION,
      latestVersion: latestTag.replace(/^v/i, ''),
      tag: latestTag,
      releaseName: releaseData.releaseName,
      releaseNotes: releaseData.releaseNotes || 'New stability improvements and fixes.',
      publishedAt: releaseData.publishedAt,
      apkUrl: releaseData.apkUrl,
      htmlUrl: releaseData.htmlUrl
    };

    try {
      localStorage.setItem(cacheKey, JSON.stringify({ timestamp: now, data: result }));
      if (isNewer) {
        localStorage.setItem('apy_has_update_badge', 'true');
      } else {
        localStorage.removeItem('apy_has_update_badge');
      }
    } catch (e) {}

    return result;
  } catch (err) {
    console.warn('Update check note:', err);
    return {
      hasUpdate: false,
      isUpToDate: true,
      error: err.message,
      currentVersion: CURRENT_APP_VERSION
    };
  }
}

/**
 * Downloads the APK / opens the download URL in the browser.
 */
const NativeAppUpdate = registerPlugin('AppUpdate');

export async function installAppUpdate(apkUrl, onProgress) {
  if (!apkUrl) {
    throw new Error('No APK download URL provided.');
  }

  if (Capacitor.isNativePlatform()) {
    const { canInstall } = await NativeAppUpdate.canInstallPackages();
    if (!canInstall) {
      await NativeAppUpdate.openInstallPermissionSettings();
      return { status: 'permission_required' };
    }

    const listener = onProgress
      ? await NativeAppUpdate.addListener('downloadProgress', onProgress)
      : null;
    try {
      return await NativeAppUpdate.downloadAndInstall({ url: apkUrl });
    } finally {
      await listener?.remove();
    }
  }

  window.open(apkUrl, '_blank');
  return { status: 'web_opened' };
}
