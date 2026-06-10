import { useEffect, useRef, useState } from "react";

export interface FreeModel {
  id: string;
  name: string;
}

export const useOpenRouterModels = () => {
  const [isFetching, setIsFetching] = useState(false);
  const [models, setModels] = useState<FreeModel[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState("");
  const [fetchError, setFetchError] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    if (showPicker) {
      document.addEventListener("mousedown", handler);
    }
    return () => document.removeEventListener("mousedown", handler);
  }, [showPicker]);

  const fetchModels = async () => {
    setIsFetching(true);
    setFetchError("");
    setModels([]);
    try {
      const res = await fetch("https://openrouter.ai/api/v1/models");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const free: FreeModel[] = (data.data || [])
        .filter((m: any) => typeof m.id === "string" && m.id.endsWith(":free"))
        .map((m: any) => ({ id: m.id, name: m.name || m.id }))
        .sort((a: FreeModel, b: FreeModel) => a.name.localeCompare(b.name));
      if (free.length === 0) {
        setFetchError("No free models found. OpenRouter may have changed their API.");
      } else {
        setModels(free);
        setShowPicker(true);
      }
    } catch {
      setFetchError("Failed to fetch models. Check your internet connection.");
    } finally {
      setIsFetching(false);
    }
  };

  const closePicker = () => {
    setShowPicker(false);
    setSearch("");
  };

  const filteredModels = models.filter(
    (m) =>
      m.id.toLowerCase().includes(search.toLowerCase()) ||
      m.name.toLowerCase().includes(search.toLowerCase())
  );

  return {
    fetchModels,
    isFetching,
    fetchError,
    models,
    filteredModels,
    showPicker,
    closePicker,
    search,
    setSearch,
    dropdownRef,
  };
};
