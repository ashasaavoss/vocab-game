import { useEffect, useState } from "react";
import { isValidUsername } from "../lib/user";

type Props = {
  knownUsers: string[];
  onSelect: (username: string) => void;
  onImportClick: () => void;
};

export function UserPicker({ knownUsers, onSelect, onImportClick }: Props) {
  const [picked, setPicked] = useState<string>("");
  const [newName, setNewName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // knownUsers arrives async (populated from localStorage in App.tsx's effect).
  // Keep `picked` in sync with the first option when it hasn't been set yet
  // or when the current pick is no longer in the list.
  useEffect(() => {
    if (knownUsers.length === 0) return;
    if (!knownUsers.includes(picked)) {
      setPicked(knownUsers[0]!);
    }
  }, [knownUsers, picked]);

  function handleSelectExisting() {
    if (!picked) return;
    onSelect(picked);
  }

  function handleCreate() {
    const name = newName.trim();
    if (!name) {
      setError("Enter a username.");
      return;
    }
    if (!isValidUsername(name)) {
      setError(
        "Usernames must be 2-20 characters, start with a letter, and use only letters, digits, or _",
      );
      return;
    }
    if (knownUsers.some((u) => u.toLowerCase() === name.toLowerCase())) {
      setError("That username already exists — pick it from the dropdown.");
      return;
    }
    onSelect(name);
  }

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0, fontSize: 18 }}>Who's playing?</h2>
      <div className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
        Progress is stored locally in this browser, per username. No password —
        this is friends-only.
      </div>

      {knownUsers.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div
            className="muted"
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 6,
            }}
          >
            Returning user
          </div>
          <div className="row" style={{ gap: 8 }}>
            <select
              value={picked}
              onChange={(e) => setPicked(e.target.value)}
              style={{
                flex: 1,
                padding: "9px 12px",
                background: "var(--panel-2)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                font: "inherit",
                fontSize: 15,
              }}
            >
              {knownUsers.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <button onClick={handleSelectExisting}>Continue</button>
          </div>
        </div>
      )}

      <div>
        <div
          className="muted"
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: 6,
          }}
        >
          New user
        </div>
        <div className="row" style={{ gap: 8 }}>
          <input
            type="text"
            value={newName}
            placeholder="pick a username"
            onChange={(e) => {
              setNewName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
            }}
            maxLength={20}
            style={{
              flex: 1,
              padding: "9px 12px",
              background: "var(--panel-2)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              font: "inherit",
              fontSize: 15,
            }}
          />
          <button onClick={handleCreate}>Start</button>
        </div>
        {error && (
          <div className="error" style={{ marginTop: 10 }}>
            {error}
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 20,
          paddingTop: 16,
          borderTop: "1px solid var(--border)",
        }}
      >
        <div
          className="muted"
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: 6,
          }}
        >
          Have an export file?
        </div>
        <button className="ghost" onClick={onImportClick} style={{ fontSize: 13 }}>
          Import session from file
        </button>
      </div>
    </div>
  );
}
