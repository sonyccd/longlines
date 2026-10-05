import { Box, Button, Stack, Typography } from "@mui/material";
import { useLocation, useNavigate } from "react-router";
import { AuthFrame } from "./AuthFrame";

export function CheckEmailPage() {
  const navigate = useNavigate();
  const { email } = (useLocation().state ?? {}) as { email?: string };
  return (
    <AuthFrame>
      <Box sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Typography variant="h6">Check your email to confirm your account</Typography>
          <Typography variant="body2" color="text.secondary">
            {email ? `We sent a confirmation link to ${email}.` : "We sent you a confirmation link."}{" "}
            Open it on this device to finish signing up. The link expires in 24 hours.
          </Typography>
          <Button variant="outlined" onClick={() => void navigate("/signin")}>Back to sign in</Button>
        </Stack>
      </Box>
    </AuthFrame>
  );
}
