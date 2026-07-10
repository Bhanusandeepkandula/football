import * as WebBrowser from 'expo-web-browser';

/**
 * Open a URL INSIDE the app (SFSafariViewController / Chrome Custom Tab presented
 * modally) instead of kicking out to the system browser. The user never leaves
 * the app — used for articles and video links across the News tab.
 */
export function openInApp(url?: string) {
  if (!url) return;
  WebBrowser.openBrowserAsync(url, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.AUTOMATIC,
    controlsColor: '#F5A623',
  }).catch(() => {});
}
