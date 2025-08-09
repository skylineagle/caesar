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
    const basePathMatch = pathname.match(/^(\/[^/]+)/);

    if (basePathMatch && basePathMatch[1] !== "/") {
      return basePathMatch[1];
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Error parsing base URL from pathname:", error);
  }

  return "/";
};

export const baseUrl = `${window.location.protocol}//${window.location.host}${getBaseUrl()}`;

// Helper function to ensure URLs are properly constructed
export const buildUrl = (path: string, params?: Record<string, string>) => {
  const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (!params || Object.keys(params).length === 0) {
    return `${base}${normalizedPath}`;
  }

  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, value);
    }
  });

  return `${base}${normalizedPath}?${searchParams.toString()}`;
};
