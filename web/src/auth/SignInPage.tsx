import { useEffect, useState, type FormEvent } from "react";
import { Alert, Box, Button, Stack, Tab, Tabs, TextField } from "@mui/material";
import { useLocation, useNavigate } from "react-router";
import { AuthFrame } from "./AuthFrame";
import { callsignAvailable, signIn, signUp } from "../lib/api";
import { isValidCallsign, normalizeCallsign } from "../lib/callsign";
import { errorText, useApp, WELCOME_KEY } from "../app/hooks";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface LocationState {
  from?: string;
  notice?: string;
}

export function SignInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as LocationState;
  const { signInNotice, setSignInNotice } = useApp();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(state.notice ?? signInNotice ?? null);
  useEffect(() => {
    if (signInNotice) setSignInNotice(null); // consumed into local state above
  }, [signInNotice, setSignInNotice]);
  const [busy, setBusy] = useState(false);

  const [ident, setIdent] = useState("");
  const [pw, setPw] = useState("");

  const [su, setSu] = useState({ callsign: "", name: "", email: "", password: "", confirm: "" });
  const setF = (k: keyof typeof su, v: string) => setSu((x) => ({ ...x, [k]: v }));
  const [touched, setTouched] = useState<Partial<Record<keyof typeof su, boolean>>>({});
  const touch = (k: keyof typeof su) => setTouched((t) => ({ ...t, [k]: true }));

  const switchMode = (m: "signin" | "signup") => {
    setMode(m);
    setError(null);
    setInfo(null);
  };

  const doSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(ident, pw);
      void navigate(state.from ?? "/sources", { replace: true });
    } catch (err) {
      setError(errorText(err, "Couldn't sign in."));
    } finally {
      setBusy(false);
    }
  };

  const csErr = !!touched.callsign && !isValidCallsign(su.callsign);
  const emErr = !!touched.email && !EMAIL_RE.test(su.email);
  const pwErr = !!touched.password && su.password.length < 8;
  const cfErr = !!touched.confirm && su.confirm !== su.password;
  const signupOk = isValidCallsign(su.callsign) && EMAIL_RE.test(su.email) && su.password.length >= 8 && su.confirm === su.password;

  const doSignUp = async (e: FormEvent) => {
    e.preventDefault();
    setTouched({ callsign: true, email: true, password: true, confirm: true });
    if (!signupOk) return;
    setBusy(true);
    setError(null);
    const callsign = normalizeCallsign(su.callsign);
    try {
      if (!(await callsignAvailable(callsign))) {
        setError("That callsign is already taken.");
        return;
      }
      await signUp({ callsign, name: su.name.trim(), email: su.email.trim(), password: su.password });
      try {
        localStorage.setItem(WELCOME_KEY, callsign);
      } catch {
        // storage unavailable; the welcome toast is a nicety
      }
      void navigate("/check-email", { state: { email: su.email.trim() } });
    } catch (err) {
      setError(errorText(err, "Couldn't create your account."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame
      busy={busy}
      tabs={
        <Tabs value={mode} onChange={(_e, v: "signin" | "signup") => switchMode(v)} variant="fullWidth">
          <Tab value="signin" label="Sign in" />
          <Tab value="signup" label="Create account" />
        </Tabs>
      }
    >
      <Box sx={{ p: 3 }}>
        {info && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setInfo(null)}>{info}</Alert>}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {mode === "signin" && (
          <Box component="form" onSubmit={(e) => void doSignIn(e)} noValidate>
            <Stack spacing={2}>
              <TextField label="Callsign or email" value={ident} onChange={(e) => setIdent(e.target.value)} autoComplete="username" autoFocus fullWidth />
              <TextField label="Password" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" fullWidth />
              <Button type="submit" variant="contained" size="large" disabled={!ident || !pw || busy} fullWidth>Sign in</Button>
              <Button size="small" onClick={() => void navigate("/reset-password")}>Forgot your password?</Button>
            </Stack>
          </Box>
        )}

        {mode === "signup" && (
          <Box component="form" onSubmit={(e) => void doSignUp(e)} noValidate>
            <Stack spacing={2}>
              <TextField
                label="Callsign" value={su.callsign} onChange={(e) => setF("callsign", e.target.value.toUpperCase().trim())} onBlur={() => touch("callsign")}
                error={csErr} helperText={csErr ? "Enter a valid amateur callsign, like KK4PWJ." : "You'll use this to sign in."}
                autoComplete="username" autoFocus required fullWidth
              />
              <TextField label="Name" value={su.name} onChange={(e) => setF("name", e.target.value)} autoComplete="name" helperText="Optional" fullWidth />
              <TextField
                label="Email" type="email" value={su.email} onChange={(e) => setF("email", e.target.value)} onBlur={() => touch("email")}
                error={emErr} helperText={emErr ? "Enter a valid email address." : "For password resets. We don't send newsletters."}
                autoComplete="email" required fullWidth
              />
              <TextField
                label="Password" type="password" value={su.password} onChange={(e) => setF("password", e.target.value)} onBlur={() => touch("password")}
                error={pwErr} helperText={pwErr ? "Use at least 8 characters." : "At least 8 characters."} autoComplete="new-password" required fullWidth
              />
              <TextField
                label="Confirm password" type="password" value={su.confirm} onChange={(e) => setF("confirm", e.target.value)} onBlur={() => touch("confirm")}
                error={cfErr} helperText={cfErr ? "Passwords don't match." : " "} autoComplete="new-password" required fullWidth
              />
              <Button type="submit" variant="contained" size="large" disabled={busy} fullWidth>Create account</Button>
            </Stack>
          </Box>
        )}
      </Box>
    </AuthFrame>
  );
}
