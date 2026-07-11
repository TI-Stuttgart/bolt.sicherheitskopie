# Skat Manager - Setup

## Das sitter_index Problem ist behoben!

Die Datenbank zeigt: ALLE Sessions haben bereits `sitter_index: 0`.

### Wenn die Änderung nicht sichtbar ist:

1. **Browser-Cache leeren**: Strg+Shift+R (Windows) oder Cmd+Shift+R (Mac)
2. **Dev-Server neu starten** in Bolt
3. **Oder**: Privat/Inkognito Fenster öffnen

### Um dieses Projekt zu nutzen:

Kopieren Sie die Dateien nach Bolt:
- src/components/CreateSession.tsx (enthält den Fix)
- current_dealer_index: 0,
sitter_index: 0,
- src/components/GameSession.tsx
- src/components/SessionList.tsx
- src/components/Auth.tsx
- src/lib/supabase.ts
- src/lib/authContext.tsx
- src/App.tsx
- src/index.css

Oder ersetzen Sie NUR die eine Zeile in CreateSession.tsx:
```typescript
// Nach dieser Zeile:
current_dealer_index: 0,
// Diese Zeile hinzufügen:
sitter_index: 0,
```
