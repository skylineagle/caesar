import { ReactNode } from "react";
import { ThemeProvider } from "@/context/theme-provider";
import { RecoilRoot } from "recoil";
import { ApiProvider } from "@/api";
import { IconContext } from "react-icons";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StatusBarMessagesProvider } from "@/context/statusbar-provider";
import { NuqsAdapter } from "nuqs/adapters/react-router";

type TProvidersProps = {
  children: ReactNode;
};

function providers({ children }: TProvidersProps) {
  return (
    <RecoilRoot>
      <ApiProvider>
        <ThemeProvider defaultTheme="system" storageKey="frigate-ui-theme">
          <TooltipProvider>
            <IconContext.Provider value={{ size: "20" }}>
              <StatusBarMessagesProvider>
                <NuqsAdapter>{children}</NuqsAdapter>
              </StatusBarMessagesProvider>
            </IconContext.Provider>
          </TooltipProvider>
        </ThemeProvider>
      </ApiProvider>
    </RecoilRoot>
  );
}

export default providers;
