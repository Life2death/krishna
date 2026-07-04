import { useState, useEffect, useCallback } from "react";
import { Label, Header, Button } from "@/components";
import { secureStorage } from "@/lib/secure-storage";
import {
  getStoredClientId,
  getStoredClientSecret,
  saveClientCredentials,
  getStoredTokens,
  startOAuthFlow,
  completeOAuthFlow,
  cancelOAuthFlow,
  disconnectGmail,
} from "@/lib/gmail-oauth";
import { invoke } from "@tauri-apps/api/core";

const GMAIL_CLIENT_ID_KEY = "GMAIL_CLIENT_ID";
const GMAIL_CLIENT_SECRET_KEY = "GMAIL_CLIENT_SECRET";

export const GmailSettings = () => {
  const [clientIdInput, setClientIdInput] = useState("");
  const [clientSecretInput, setClientSecretInput] = useState("");
  const [hasCredentials, setHasCredentials] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    const cid = await getStoredClientId();
    setHasCredentials(!!cid);
    const tokens = await getStoredTokens();
    setConnected(!!tokens?.access_token);
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const handleSaveCredentials = async () => {
    if (!clientIdInput.trim() || !clientSecretInput.trim()) return;
    setError(null);
    try {
      await saveClientCredentials(clientIdInput.trim(), clientSecretInput.trim());
      const stored = await getStoredClientId();
      if (!stored) {
        throw new Error("Credentials did not persist.");
      }
      setHasCredentials(true);
      setClientIdInput("");
      setClientSecretInput("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await refreshStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save credentials.");
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const { auth_url, code_verifier } = await startOAuthFlow();
      await invoke("open_target", { target: auth_url });
      await completeOAuthFlow(code_verifier);
      setConnected(true);
      await refreshStatus();
    } catch (e) {
      if (e instanceof Error && e.message.includes("authorization denied")) {
        setError("Authorization was denied or cancelled.");
      } else {
        setError(e instanceof Error ? e.message : "Failed to connect Gmail.");
      }
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setError(null);
    try {
      await disconnectGmail();
      setConnected(false);
      await refreshStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to disconnect.");
    }
  };

  return (
    <div id="gmail" className="space-y-3">
      <Header
        title="Gmail"
        description="Connect your Gmail account so Krishna can search, read, and send emails by voice."
        isMainTitle
      />

      {/* Credentials */}
      <div className="space-y-3 rounded-lg border p-3">
        <Label className="text-sm font-medium">Google OAuth Credentials</Label>
        <p className="text-xs text-muted-foreground">
          Paste the client_id and client_secret from your Google Cloud OAuth
          credentials JSON file (Desktop app type, installed app). Get them from{" "}
          <a
            href="https://console.cloud.google.com/apis/credentials"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            Google Cloud Console
          </a>
          . Enable the Gmail API and add your email as a test user.
        </p>

        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="password"
              className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder={hasCredentials ? "Client ID saved — paste to replace" : "client_id..."}
              value={clientIdInput}
              onChange={(e) => setClientIdInput(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <input
              type="password"
              className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder={hasCredentials ? "Client secret saved — paste to replace" : "client_secret..."}
              value={clientSecretInput}
              onChange={(e) => setClientSecretInput(e.target.value)}
            />
          </div>
        </div>

        <Button
          size="sm"
          onClick={handleSaveCredentials}
          disabled={!clientIdInput.trim() || !clientSecretInput.trim()}
        >
          {saved ? "Saved" : "Save Credentials"}
        </Button>

        {hasCredentials && !clientIdInput.trim() && (
          <p className="text-xs text-green-500">✓ OAuth credentials configured</p>
        )}
      </div>

      {/* Connection */}
      <div className="space-y-3 rounded-lg border p-3">
        <Label className="text-sm font-medium">Gmail Connection</Label>
        <p className="text-xs text-muted-foreground">
          Authorize Krishna to access your Gmail account (read-only + send).
          This opens Google's consent screen in your browser.
        </p>

        <div className="flex items-center gap-2">
          {connected ? (
            <>
              <span className="text-xs text-green-500">✓ Connected</span>
              <Button size="sm" variant="outline" onClick={handleDisconnect}>
                Disconnect
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              onClick={handleConnect}
              disabled={!hasCredentials || connecting}
            >
              {connecting ? "Connecting..." : "Connect Gmail"}
            </Button>
          )}
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    </div>
  );
};
