import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import BigBossPrototype, { PublicProposalPage, PublicPresentationPage, PublicLinkPage, PublicGrowthMapPage } from "./BigBossPrototype.jsx";
import { PublicFormPage } from "./modules/forms/FormsModule.jsx";
import { PublicBookingPage } from "./modules/booking/BookingModule.jsx";
import SignupPage from "./modules/billing/SignupPage.jsx";
import SignContractPage from "./modules/contracts/SignContractPage.jsx";
import ClientApp from "./modules/clientapp/ClientApp.jsx";

// Exemplar de design: só existe em desenvolvimento (não entra no build de produção).
const DesignSpecimen = import.meta.env.DEV ? lazy(() => import("./design/DesignSpecimen.jsx")) : null;

// App de uma marca com endereço próprio (ex: dreams-studio.vercel.app,
// projeto Vercel com VITE_CLIENT_APP_SLUG): só existe a app dessa marca
// e a sua página de marcação; nada do Big Boss.
const CLIENT_APP_SLUG = String(import.meta.env.VITE_CLIENT_APP_SLUG || "").trim();

function StandaloneClientApp() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ClientApp />} />
        <Route path="/agendar" element={<PublicBookingPage />} />
        <Route path="/app/:slug" element={<Navigate to="/" replace />} />
        <Route path="/agendar/:slug" element={<Navigate to="/agendar" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function App() {
  if (CLIENT_APP_SLUG) return <StandaloneClientApp />;
  return (
    <BrowserRouter>
      <Routes>
        {DesignSpecimen && (
          <Route path="/design" element={<Suspense fallback={null}><DesignSpecimen /></Suspense>} />
        )}
        <Route path="/proposta/:slug" element={<PublicProposalPage />} />
        <Route path="/apresentacao/:id" element={<PublicPresentationPage />} />
        <Route path="/link/:slug" element={<PublicLinkPage />} />
        <Route path="/mapa/:slug" element={<PublicGrowthMapPage />} />
        <Route path="/formulario/:slug" element={<PublicFormPage />} />
        <Route path="/agendar/:slug" element={<PublicBookingPage />} />
        <Route path="/app/:slug" element={<ClientApp />} />
        <Route path="/registar" element={<SignupPage />} />
        <Route path="/assinar/:token" element={<SignContractPage />} />
        <Route path="*" element={<BigBossPrototype />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
