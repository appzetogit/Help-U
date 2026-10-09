/**
 * Production-Ready Flutter JS Bridge
 * Handles secure and optimized communication with native mobile features.
 */
class FlutterBridge {
  constructor() {
    this.isFlutter =
      typeof window !== "undefined" &&
      window.flutter_inappwebview;
  }

  /**
   * Waits for the native WebView bride to be fully available.
   */
  waitForFlutter() {
    return new Promise((resolve) => {
      if (this.isFlutter) return resolve(true);

      window.addEventListener(
        "flutterInAppWebViewPlatformReady",
        () => {
          this.isFlutter = true;
          resolve(true);
        },
        { once: true }
      );

      // 1-second timeout as safety
      setTimeout(() => resolve(false), 1000);
    });
  }

  /**
   * Universal call to any Flutter JS Handler with availability check.
   */
  async callHandler(handlerName, data = {}) {
    await this.waitForFlutter();

    if (!this.isFlutter) {
      // Quietly return failure for web browsers - this is expected
      return { success: false, error: "Not inside Flutter WebView" };
    }

    try {
      return await window.flutter_inappwebview.callHandler(handlerName, data);
    } catch (error) {
      console.error(`[FlutterBridge] Error calling native handler ${handlerName}:`, error);
      return { success: false, error: error.message };
    }
  }

  /* ================================
        CAMERA (NATIVE)
  ================================== */
  async openCamera() {
    try {
      const result = await this.callHandler("openCamera");

      if (result && result.success) {
        // Convert base64 to blob without using fetch to avoid any CSP connect-src issues
        const byteString = atob(result.base64);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: result.mimeType || 'image/jpeg' });

        return new File([blob], result.fileName || `cam_${Date.now()}.jpg`, {
          type: result.mimeType || 'image/jpeg',
        });
      }
      return null;
    } catch (error) {
      console.error("[FlutterBridge] Camera Error:", error);
      return null;
    }
  }

  /* ================================
        LOCATION (NATIVE + FALLBACK)
  ================================== */
  async getCurrentLocation() {
    try {
      const result = await this.callHandler("getLocation");

      if (result && result.success) {
        return {
          latitude: result.latitude,
          longitude: result.longitude,
          source: 'flutter_native'
        };
      }

      // If native bridge result is failure, throw to trigger fallback
      throw new Error("Native location failed");
    } catch (error) {
      if (this.isFlutter) {
        console.warn("[FlutterBridge] Flutter Location Error, falling back to browser GPS:", error);
      }

      // Browser fallback (Web Geolocation API)
      return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error("Geolocation not supported by browser"));
          return;
        }

        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              source: 'browser_gps'
            });
          },
          (err) => {
            if (this.isFlutter) {
              console.error("[FlutterBridge] Browser fallback also failed:", err.message);
            }
            reject(err);
          },
          {
            enableHighAccuracy: false, // Turned false to reduce timeout chances on weaker network/GPS
            timeout: 15000, // Increased timeout to 15 seconds
            maximumAge: 10000 // Allow up to 10 seconds old cached locations to further prevent timeouts
          }
        );
      });
    }
  }

  /**
   * Triggers native haptic feedback.
   */
  async hapticFeedback(type = "medium") {
    return this.callHandler("haptic", { type });
  }

  /**
   * Opens App/System Settings (Native)
   */
  async openAppSettings() {
    return this.callHandler("openSettings");
  }
}

const bridgeInstance = new FlutterBridge();
export default bridgeInstance;
export const flutterBridge = bridgeInstance;
