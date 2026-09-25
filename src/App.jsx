import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import BigBossPrototype, { PublicProposalPage, PublicPresentationPage, PublicLinkPage, PublicGrowthMapPage } from "./BigBossPrototype.jsx";
import { PublicFormPage } from "./modules/forms/FormsModule.jsx";
import { PublicBookingPage } from "./modules/booking/BookingModule.jsx";
import SignupPage from "./modules/billing/SignupPage.jsx";
import SignContractPage from "./modules/contracts/SignContractPage.jsx";

// Exemplar de design: só existe em desenvolvimento (não entra no build de produção).
const DesignSpecimen = import.meta.env.DEV ? lazy(() => import("./design/DesignSpecimen.jsx")) : null;

function App() {
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
        <Route path="/registar" element={<SignupPage />} />
        <Route path="/assinar/:token" element={<SignContractPage />} />
        <Route path="*" element={<BigBossPrototype />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
