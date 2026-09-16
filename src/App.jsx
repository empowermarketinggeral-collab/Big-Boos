import { BrowserRouter, Routes, Route } from "react-router-dom";
import BigBossPrototype, { PublicProposalPage, PublicPresentationPage, PublicLinkPage, PublicGrowthMapPage } from "./BigBossPrototype.jsx";
import { PublicFormPage } from "./modules/forms/FormsModule.jsx";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/proposta/:slug" element={<PublicProposalPage />} />
        <Route path="/apresentacao/:id" element={<PublicPresentationPage />} />
        <Route path="/link/:slug" element={<PublicLinkPage />} />
        <Route path="/mapa/:slug" element={<PublicGrowthMapPage />} />
        <Route path="/formulario/:slug" element={<PublicFormPage />} />
        <Route path="*" element={<BigBossPrototype />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
