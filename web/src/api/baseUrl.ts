declare global {
  interface Window {
    baseUrl?: string;
  }
}

const getBaseUrl = () => {
  if (window.baseUrl) {
    return window.baseUrl;
  }

  try {
    const pathname = window.location.pathname;
    const basePathMatch = pathname.match(/^(\/[^\/]+)/);

    if (basePathMatch && basePathMatch[1] !== "/") {
      return basePathMatch[1];
    }
  } catch (error) {
    console.warn("Error parsing base URL from pathname:", error);
  }

  return "/";
};

export const baseUrl = `${window.location.protocol}//${window.location.host}${getBaseUrl()}`;
