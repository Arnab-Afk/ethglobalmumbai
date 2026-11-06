import { Nav } from "@/components/nav";
import { SEPOLIA } from "@/lib/deployments";

/** Nav and footer for the swap app. Wallet state lives on the root layout so it survives route changes. */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <main className="flex flex-1 flex-col">{children}</main>
      <footer className="pb-5 pt-4 text-center text-xs text-muted">
        ETHGlobal Mumbai · Inspired by PropellerHeads&apos; Fynd · Contracts on{" "}
        <a
          href={`${SEPOLIA.explorer}/address/${SEPOLIA.contracts.CompetitiveFeeExtruction}`}
          target="_blank"
          rel="noreferrer"
          className="text-accent hover:underline"
        >
          Sepolia
        </a>
      </footer>
    </>
  );
}
