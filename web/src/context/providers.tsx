import { ReactNode } from "react";
import { ThemeProvider } from "@/context/theme-provider";
import { RecoilRoot } from "recoil";
import { ApiProvider } from "@/api";
import { IconContext } from "react-icons";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StatusBarMessagesProvider } from "@/context/statusbar-provider";
import { LanguageProvider } from "./language-provider";
import { StreamingSettingsProvider } from "./streaming-settings-provider";
import { AuthProvider } from "./auth-context";
import { NuqsAdapter } from "nuqs/adapters/react-router/v6";

type TProvidersProps = {
  children: ReactNode;
};

function providers({ children }: TProvidersProps) {
  return (
    <RecoilRoot>
      <AuthProvider>
        <ApiProvider>
          <ThemeProvider defaultTheme="system" storageKey="frigate-ui-theme">
            <LanguageProvider>
              <TooltipProvider>
                <IconContext.Provider value={{ size: "20" }}>
                  <StatusBarMessagesProvider>
                    <StreamingSettingsProvider>
                      <NuqsAdapter> {children}</NuqsAdapter>
                    </StreamingSettingsProvider>
                  </StatusBarMessagesProvider>
                </IconContext.Provider>
              </TooltipProvider>
            </LanguageProvider>
          </ThemeProvider>
        </ApiProvider>
      </AuthProvider>
    </RecoilRoot>
  );
}

export default providers;
