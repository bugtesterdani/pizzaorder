import { useCallback } from "react";
import { toast } from "sonner";
import { adminApi, errorText } from "@/lib/api";

export const useAdmin = (onAuthError) =>
  useCallback(async (fn) => {
    try {
      return await fn(adminApi());
    } catch (e) {
      if (e?.response?.status === 401 || e?.response?.status === 403) onAuthError();
      else toast.error(errorText(e));
      return null;
    }
  }, [onAuthError]);
