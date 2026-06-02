import { AppShell } from "./components/AppShell";
import { TooltipProvider } from "./components/ui/tooltip";

function App() {
  return (
    <TooltipProvider>
      <AppShell />
    </TooltipProvider>
  );
}

export default App;
