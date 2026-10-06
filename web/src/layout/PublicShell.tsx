import type { ReactNode } from "react";
import { AppBar, Box, Button, Container, Toolbar, Typography } from "@mui/material";
import { useLocation, useNavigate } from "react-router";

/** The signed-out frame for pages anyone can view: AppShell's bar and content area without the drawer or account menu. */
export function PublicShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <Box>
      <AppBar position="fixed" sx={{ pt: "env(safe-area-inset-top, 0px)" }}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Long Lines</Typography>
          <Button color="inherit" onClick={() => void navigate("/signin", { state: { from: location.pathname } })}>Sign in</Button>
        </Toolbar>
      </AppBar>
      <Box component="main">
        <Toolbar />
        <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 4 }, px: { xs: 1.5, sm: 3 } }}>
          {children}
        </Container>
      </Box>
    </Box>
  );
}
