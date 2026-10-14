import { useCallback, useEffect, useState } from "react";

const API_ORIGIN = "https://lyft-driver.onrender.com";

export const getApiUrl = (url: string) => {
  if (/^[a-z][a-z\d+.-]*:/i.test(url)) {
    return url;
  }

  const endpoint = url.replace(/^\/\(api\)(?=\/|$)/, "");
  return new URL(endpoint, `${API_ORIGIN}/`).toString();
};

export const fetchAPI = async (
  url: string,
  options?: RequestInit,
  { logErrors = true }: { logErrors?: boolean } = {},
) => {
  try {
    const response = await fetch(getApiUrl(url), options);
    if (!response.ok) {
      const contentType = response.headers.get("content-type") ?? "";
      let errorMessage = `HTTP error! status: ${response.status}`;

      if (contentType.includes("application/json")) {
        const body = await response.json();
        errorMessage = body?.error ?? body?.details ?? errorMessage;
      } else {
        const body = await response.text();
        if (body) {
          errorMessage = body;
        }
      }

      throw new Error(errorMessage);
    }
    return await response.json();
  } catch (error) {
    if (logErrors) {
      console.warn("Fetch error:", error);
    }
    throw error;
  }
};

export const useFetch = <T>(url: string, options?: RequestInit) => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await fetchAPI(url, options);
      setData(result.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [url, options]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
};
