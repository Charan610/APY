import { registerPlugin, Capacitor } from '@capacitor/core';

export const CURRENT_APP_VERSION = '1.3.0';
export const CURRENT_APP_BUILD_DATE = 'September 4, 2026';
export const GITHUB_RELEASES_URL = 'https://api.github.com/repos/Charan610/APY/releases/latest';

export const AppUpdate = registerPlugin('AppUpdate');

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
 * Silent and non-blocking with local caching.
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
        if (now - parsed.timestamp < 5 * 60 * 1000 && parsed.data) {
          return parsed.data;
        }
      } catch (e) {}
    }

    const response = await fetch(GITHUB_RELEASES_URL, {
      headers: {
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        // No releases published yet
        const noRelease = {
          hasUpdate: false,
          currentVersion: CURRENT_APP_VERSION,
          latestVersion: CURRENT_APP_VERSION,
          releaseNotes: '',
          apkUrl: null,
          isUpToDate: true
        };
        return noRelease;
      }
      throw new Error(`GitHub API returned status ${response.status}`);
    }

    const release = await response.json();
    const latestTag = release.tag_name || release.name || '';
    const isNewer = compareVersions(latestTag, CURRENT_APP_VERSION) > 0;

    // Locate the APK asset in the release
    let apkUrl = null;
    if (Array.isArray(release.assets)) {
      const apkAsset = release.assets.find(a => a.name && a.name.toLowerCase().endsWith('.apk'));
      if (apkAsset) {
        apkUrl = apkAsset.browser_download_url;
      }
    }

    // Fallback URL if asset not directly found
    if (!apkUrl && release.html_url) {
      apkUrl = `${release.html_url}/download/APY.apk`;
    }

    const result = {
      hasUpdate: isNewer,
      isUpToDate: !isNewer,
      currentVersion: CURRENT_APP_VERSION,
      latestVersion: latestTag.replace(/^v/i, ''),
      tag: latestTag,
      releaseName: release.name || latestTag,
      releaseNotes: release.body || 'New stability improvements and fixes.',
      publishedAt: release.published_at,
      apkUrl,
      htmlUrl: release.html_url
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
 * Downloads the APK and triggers Android's package installer intent via FileProvider.
 */
export async function installAppUpdate(apkUrl, onProgress) {
  if (!apkUrl) {
    throw new Error('No APK download URL provided.');
  }

  const isNative = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();

  if (isNative && platform === 'android') {
    let progressListener = null;
    try {
      if (onProgress && typeof AppUpdate.addListener === 'function') {
        progressListener = await AppUpdate.addListener('downloadProgress', (info) => {
          onProgress(info);
        });
      }

      const res = await AppUpdate.downloadAndInstall({ url: apkUrl });
      return res;
    } finally {
      if (progressListener && typeof progressListener.remove === 'function') {
        progressListener.remove();
      }
    }
  } else {
    // Web / browser fallback: open download directly
    window.open(apkUrl, '_blank');
    return { status: 'web_opened' };
  }
}
