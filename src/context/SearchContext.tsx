"use client";

import React, { createContext, useContext, useState } from "react";

interface SearchContextType {
  search: string;
  setSearch: (value: string) => void;
  selectedClientId: string | null;
  setSelectedClientId: (value: string | null) => void;
  selectedClientProject: string | null;
  setSelectedClientProject: (value: string | null) => void;
}

const SearchContext = createContext<SearchContextType | undefined>(undefined);

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [search, setSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedClientProject, setSelectedClientProject] = useState<string | null>(null);

  return (
    <SearchContext.Provider value={{ 
      search, 
      setSearch, 
      selectedClientId, 
      setSelectedClientId,
      selectedClientProject,
      setSelectedClientProject
    }}>
      {children}
    </SearchContext.Provider>
  );
}

export function useSearch() {
  const context = useContext(SearchContext);
  if (context === undefined) {
    throw new Error("useSearch must be used within a SearchProvider");
  }
  return context;
}
