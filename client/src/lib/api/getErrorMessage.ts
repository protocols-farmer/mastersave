export function getErrorMessage(
  error: any,
  fallback: string = "Something went wrong. Please try again.",
): string {
  // Errors we wrote ourselves (for example Google sign-in) carry their own user message
  if (typeof error?.userMessage === "string") {
    return error.userMessage;
  }

  // No response at all = network problem or timeout
  if (!error?.response) {
    if (error?.code === "ECONNABORTED") {
      return "This is taking too long. Please check your connection and try again.";
    }
    return "We couldn't reach the server. Please check your internet connection and try again.";
  }

  const status: number = error.response.status;
  const data = error.response.data;

  if (status === 429) {
    const seconds = Number(data?.remainingSeconds);
    if (seconds > 0) {
      const minutes = Math.ceil(seconds / 60);
      return `Too many attempts. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
    }
    return "Too many requests. Please wait a moment and try again.";
  }

  if (status === 503) {
    return (
      data?.message ||
      "The service is temporarily unavailable. Please try again soon."
    );
  }

  if (status >= 500) {
    // The backend already wrote a friendly sentence for 5xx too, but we never want
    // to risk showing technical text for a server fault.
    if (typeof data?.error === "string" && data?.code) return data.error;
    return "Something went wrong on our side. Please try again in a moment.";
  }

  // 4xx: the backend writes these sentences for end users
  if (typeof data?.error === "string" && data.error.length > 0) {
    return data.error;
  }

  return fallback;
}
