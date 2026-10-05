import { useState } from "react";
import { Box, Button, Stack, TextField } from "@mui/material";
import { updatePassword, verifyPassword } from "../lib/api";
import { errorText, useNotify } from "../app/hooks";

export function ChangePassword({ email }: { email: string }) {
  const notify = useNotify();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const short = next.length > 0 && next.length < 8;
  const mismatch = confirm.length > 0 && confirm !== next;
  const ok = !!cur && next.length >= 8 && confirm === next;

  const submit = async () => {
    setBusy(true);
    try {
      await verifyPassword(email, cur);
      await updatePassword(next);
      setCur("");
      setNext("");
      setConfirm("");
      notify("Password changed");
    } catch (err) {
      notify(errorText(err, "Couldn't change your password."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={2} sx={{ mt: 2 }}>
      <TextField label="Current password" type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" fullWidth />
      <TextField
        label="New password" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password"
        error={short} helperText={short ? "Use at least 8 characters." : "At least 8 characters."} fullWidth
      />
      <TextField
        label="Confirm new password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password"
        error={mismatch} helperText={mismatch ? "Passwords don't match." : " "} fullWidth
      />
      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Button variant="contained" disabled={!ok || busy} onClick={() => void submit()}>Change password</Button>
      </Box>
    </Stack>
  );
}
