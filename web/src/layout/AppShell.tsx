import { useState, type ReactNode } from "react";
import {
  AppBar, Avatar, Badge, Box, Button, Container, Divider, Drawer, IconButton, List, ListItem,
  ListItemButton, ListItemIcon, ListItemText, Menu, MenuItem, Toolbar, Typography, useMediaQuery, useTheme,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import SensorsIcon from "@mui/icons-material/Sensors";
import FilterListIcon from "@mui/icons-material/FilterList";
import SendIcon from "@mui/icons-material/Send";
import { useLocation, useNavigate } from "react-router";
import { useApp } from "../app/hooks";
import { signOut } from "../lib/api";
import { useTour } from "../tour/hooks";

const NAV = [
  { id: "sources", label: "Sources", icon: <SensorsIcon /> },
  { id: "subscriptions", label: "Subscriptions", icon: <FilterListIcon /> },
  { id: "destinations", label: "Destinations", icon: <SendIcon /> },
];
const DRAWER = 232;

export function AppShell({ children, destinationsFailing }: { children: ReactNode; destinationsFailing: boolean }) {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("md"));
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, session, notify } = useApp();
  const { start: startTour } = useTour();
  const [navOpen, setNavOpen] = useState(false);
  const [menuEl, setMenuEl] = useState<HTMLElement | null>(null);
  const takeTour = () => {
    setMenuEl(null);
    setNavOpen(false);
    startTour();
  };
  const page = location.pathname.replace(/^\//, "").split("/")[0] ?? "";
  const callsign = profile?.callsign ?? "";
  const initials = callsign.slice(0, 2) || "?";

  const go = (path: string) => {
    setMenuEl(null);
    setNavOpen(false);
    void navigate(`/${path}`);
  };

  const handleSignOut = async () => {
    setMenuEl(null);
    try {
      await signOut();
    } catch {
      notify("Couldn't sign out. Try again.");
    }
  };

  const nav = (
    <Box>
      <Toolbar />
      <List>
        {NAV.map((n) => (
          <ListItemButton key={n.id} selected={page === n.id} onClick={() => go(n.id)}>
            <ListItemIcon>
              {n.id === "destinations"
                ? <Badge color="error" variant="dot" invisible={!destinationsFailing}>{n.icon}</Badge>
                : n.icon}
            </ListItemIcon>
            <ListItemText primary={n.label} />
          </ListItemButton>
        ))}
      </List>
      <Divider />
      <List dense>
        <ListItem><ListItemText primary="Groups" secondary="Coming later" /></ListItem>
        <ListItem><ListItemText primary="Stats" secondary="Coming later" /></ListItem>
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: "flex" }}>
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1, pt: "env(safe-area-inset-top, 0px)" }}>
        <Toolbar>
          {mobile && (
            <IconButton color="inherit" edge="start" onClick={() => setNavOpen(true)} sx={{ mr: 1 }} aria-label="Open navigation">
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Long Lines</Typography>
          <IconButton color="inherit" onClick={(e) => setMenuEl(e.currentTarget)} aria-label="Account menu" sx={{ display: { xs: "inline-flex", sm: "none" } }}>
            <Avatar sx={{ width: 32, height: 32 }}>{initials}</Avatar>
          </IconButton>
          <Button
            color="inherit"
            onClick={(e) => setMenuEl(e.currentTarget)}
            startIcon={<Avatar sx={{ width: 28, height: 28 }}>{initials}</Avatar>}
            aria-label="Account menu"
            sx={{ display: { xs: "none", sm: "inline-flex" } }}
          >
            {callsign}
          </Button>
          <Menu
            anchorEl={menuEl}
            open={!!menuEl}
            onClose={() => setMenuEl(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
          >
            <Box sx={{ px: 2, py: 1 }}>
              <Typography variant="subtitle2">{profile?.name || callsign}</Typography>
              <Typography variant="body2" color="text.secondary">{session?.user.email}</Typography>
            </Box>
            <Divider />
            <MenuItem onClick={() => go("account")}>Account</MenuItem>
            <MenuItem onClick={takeTour}>Take the tour</MenuItem>
            <MenuItem onClick={() => void handleSignOut()}>Sign out</MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>
      <Drawer
        variant={mobile ? "temporary" : "permanent"}
        open={mobile ? navOpen : true}
        onClose={() => setNavOpen(false)}
        sx={{ width: DRAWER, flexShrink: 0, "& .MuiDrawer-paper": { width: DRAWER, boxSizing: "border-box" } }}
      >
        {nav}
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, minWidth: 0 }}>
        <Toolbar />
        <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 4 }, px: { xs: 1.5, sm: 3 } }}>
          {children}
        </Container>
      </Box>
    </Box>
  );
}
