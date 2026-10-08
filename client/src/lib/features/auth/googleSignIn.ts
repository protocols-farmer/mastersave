// src/lib/features/auth/googleSignIn.ts
let isConfigured = false;

function makeFriendlyError(code: string, userMessage: string): any {
  const friendly: any = new Error(code);
  friendly.userMessage = userMessage;
  return friendly;
}

// Loaded lazily so the app still opens in Expo Go (where the native module does not exist)
function loadGoogleModule(): any {
  try {
    return require("@react-native-google-signin/google-signin");
  } catch (error: any) {
    console.error(
      `[GOOGLE SIGN-IN ERROR] Native module not available: ${error.message}\nStack: ${error.stack}`,
    );
    throw makeFriendlyError(
      "GOOGLE_MODULE_UNAVAILABLE",
      "Google sign-in isn't available in this version of the app. Please use your email and password.",
    );
  }
}

// Opens the Google account picker and returns a fresh Google ID token.
// Returns null when the user closes the picker (that is not an error).
export async function getGoogleIdToken(): Promise<string | null> {
  const { GoogleSignin, statusCodes } = loadGoogleModule();

  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!webClientId) {
    console.error(
      "[GOOGLE SIGN-IN FATAL ERROR]: EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is missing from your .env file.",
    );
    throw makeFriendlyError(
      "GOOGLE_CLIENT_ID_MISSING",
      "Google sign-in isn't set up yet. Please use your email and password.",
    );
  }

  if (!isConfigured) {
    GoogleSignin.configure({
      webClientId,
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      scopes: ["profile", "email"],
    });
    isConfigured = true;
  }

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    // Sign out first so the account picker always appears and the ID token is brand new.
    // The backend requires a token issued in the last 5 minutes when a Google user sets a password.
    try {
      await GoogleSignin.signOut();
    } catch (signOutError: any) {
      console.error(
        `[GOOGLE SIGN-IN ERROR] signOut before signIn failed: ${signOutError.message}\nStack: ${signOutError.stack}`,
      );
    }

    const response = await GoogleSignin.signIn();

    // Newer versions of the library return { type: "cancelled" } instead of throwing
    if (response?.type === "cancelled") return null;

    // Newer versions: response.data.idToken. Older versions: response.idToken
    const idToken: string | undefined =
      response?.data?.idToken ?? response?.idToken;

    if (!idToken) {
      console.error(
        `[GOOGLE SIGN-IN ERROR] Google returned no idToken. Response: ${JSON.stringify(response)}`,
      );
      throw makeFriendlyError(
        "GOOGLE_NO_ID_TOKEN",
        "We couldn't get your Google details. Please try again.",
      );
    }

    return idToken;
  } catch (error: any) {
    // Already one of our friendly errors
    if (error?.userMessage) throw error;

    if (error?.code === statusCodes.SIGN_IN_CANCELLED) return null;

    console.error(
      `[GOOGLE SIGN-IN ERROR] code=${error?.code} message=${error?.message}\nStack: ${error?.stack}`,
    );

    if (error?.code === statusCodes.IN_PROGRESS) {
      throw makeFriendlyError(
        "GOOGLE_IN_PROGRESS",
        "Google sign-in is already in progress.",
      );
    }
    if (error?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      throw makeFriendlyError(
        "GOOGLE_PLAY_SERVICES",
        "Google Play Services is missing or out of date on this phone.",
      );
    }

    throw makeFriendlyError(
      "GOOGLE_UNKNOWN",
      "We couldn't sign you in with Google. Please try again.",
    );
  }
}

// Called on logout, so the next person on this phone gets the account picker
export async function signOutOfGoogle(): Promise<void> {
  try {
    const {
      GoogleSignin,
    } = require("@react-native-google-signin/google-signin");
    await GoogleSignin.signOut();
  } catch (error: any) {
    console.error(
      `[GOOGLE SIGN-IN ERROR] signOut on logout failed: ${error.message}\nStack: ${error.stack}`,
    );
  }
}
