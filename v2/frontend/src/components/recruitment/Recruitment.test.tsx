import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProposalForm from './ProposalForm';
import RequestsSection from './RequestsSection';
import RequestPage from '../../pages/RequestPage';
import { recruitmentApi, type HiringRequest } from '../../recruitmentApi';
import type { AuthUser } from '../../types';

const state = vi.hoisted(() => ({ user: null as AuthUser | null }));
vi.mock('../../context/UserContext', () => ({ useUserContext: () => ({ user: state.user, clearUser: vi.fn() }) }));
vi.mock('../../recruitmentApi', async importOriginal => ({ ...await importOriginal<typeof import('../../recruitmentApi')>(), recruitmentApi: vi.fn() }));
const restaurant = { slug: 'restaurant', display_name: 'Restaurant', role: 'client', token: 'token' } as AuthUser;
const extra = { slug: 'adam', display_name: 'Adam', role: 'freelance', token: 'token' } as AuthUser;
const base: HiringRequest = { id: 'req-1', establishment: 'Chez Test', address: '1 rue Test', starts_at: '2026-10-09T16:00:00Z', ends_at: '2026-10-09T21:00:00Z',
  job: 'service', custom_job: '', dress_code: 'Noir', notes: '', quantity: 1, cascade: true, rate_kind: 'hourly', rate: '25', status: 'recruiting', next_wave_at: null,
  is_client: false, client: { slug: 'restaurant', display_name: 'Restaurant', avatar_url: '' }, target: { slug: 'adam', display_name: 'Adam', avatar_url: '' },
  remaining: 1, interested_count: 0, compatible_after: 4, available_after: 2,
  offers: [{ id: 1, extra: { slug: 'adam', display_name: 'Adam', avatar_url: '' }, state: 'offered', wave: 0, offered_at: '2026-10-02', mission_id: null, timesheet: null }] };
afterEach(cleanup);
beforeEach(() => { sessionStorage.clear(); state.user = restaurant; vi.mocked(recruitmentApi).mockReset(); });
const wrap = (element: React.ReactNode) => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{element}</MemoryRouter>);
function fillProposal() {
  fireEvent.click(screen.getByRole('button', { name: 'Proposer une mission à Adam' }));
  fireEvent.change(screen.getByLabelText('Établissement'), { target: { value: 'Chez Test' } });
  fireEvent.change(screen.getByLabelText('Adresse complète du service'), { target: { value: '1 rue Test' } });
  fireEvent.change(screen.getByLabelText('Début du service'), { target: { value: '2026-10-09T18:00' } });
  fireEvent.change(screen.getByLabelText('Fin du service'), { target: { value: '2026-10-09T23:00' } });
}
function mockRequest(req: HiringRequest) {
  vi.mocked(recruitmentApi).mockImplementation(async path => {
    if (path === 'notifications/') return { unread: 0, items: [] } as never;
    return req as never;
  });
}
function showRequest() { return render(<MemoryRouter initialEntries={['/requests/req-1']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route path="/requests/:id" element={<RequestPage />} /></Routes></MemoryRouter>); }

describe('Parcours de recrutement', () => {
  it('envoie une demande avec une cascade facultative, sans utiliser les anciennes missions', async () => {
    vi.mocked(recruitmentApi).mockResolvedValue(base);
    wrap(<ProposalForm slug="adam" extraName="Adam" />); fillProposal();
    expect((screen.getByLabelText(/Chercher aussi dans le réseau/) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer la demande' }));
    await waitFor(() => expect(recruitmentApi).toHaveBeenCalledWith('requests/', 'token', 'POST', expect.objectContaining({ target_slug: 'adam', cascade: true, quantity: 1, rate: null })));
  });
  it('conserve le formulaire et la destination avant la connexion', () => {
    state.user = null; wrap(<ProposalForm slug="adam" extraName="Adam" />); fillProposal();
    fireEvent.click(screen.getByRole('link', { name: /^Se connecter$/ }));
    expect(JSON.parse(sessionStorage.getItem('rivebelle-proposal-adam')!).establishment).toBe('Chez Test');
    expect(sessionStorage.getItem('rivebelle-hiring-return')).toBe('/extras/adam');
    expect(recruitmentApi).not.toHaveBeenCalled();
  });
  it('affiche une erreur et permet de réessayer un envoi', async () => {
    vi.mocked(recruitmentApi).mockRejectedValue(new Error('Le tarif doit être positif.'));
    wrap(<ProposalForm slug="adam" extraName="Adam" />); fillProposal();
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer la demande' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Le tarif doit être positif.');
    expect((screen.getByRole('button', { name: 'Envoyer la demande' }) as HTMLButtonElement).disabled).toBe(false);
  });
  it('envoie sans compte avec un email et explique la confirmation attendue', async () => {
    state.user = null; vi.mocked(recruitmentApi).mockResolvedValue({ pending_email: true } as never);
    wrap(<ProposalForm slug="adam" extraName="Adam" />); fillProposal();
    fireEvent.change(screen.getByLabelText('Votre adresse email'), { target: { value: 'restaurant@example.org' } });
    fireEvent.click(screen.getByRole('button', { name: 'Recevoir mon lien et envoyer la demande' }));
    await waitFor(() => expect(recruitmentApi).toHaveBeenCalledWith('guest/requests/', '', 'POST', expect.objectContaining({ email: 'restaurant@example.org', cascade: true })));
    expect(await screen.findByText('Un dernier clic dans votre boîte mail')).toBeTruthy();
  });
  it('affiche les compteurs disponibles et inconnus puis permet de passer', async () => {
    state.user = extra; mockRequest(base); showRequest();
    expect(await screen.findByText(/4 extra\(s\) compatible\(s\).*2 avec une disponibilité déclarée/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Non, sauf si personne d’autre accepte' }));
    await waitFor(() => expect(recruitmentApi).toHaveBeenCalledWith('requests/req-1/offers/1/action/', 'token', 'POST', { action: 'deferred' }));
  });
  it('l’intérêt attend la sélection du restaurateur', async () => {
    state.user = extra; mockRequest({ ...base, offers: [{ ...base.offers[0], state: 'interested' }] }); showRequest();
    expect(await screen.findByText(/La mission sera confirmée lorsque le restaurateur vous sélectionnera/)).toBeTruthy();
    expect(screen.queryByText('Confirmer cet extra')).toBeNull();
  });
  it('le restaurateur peut sélectionner un candidat', async () => {
    mockRequest({ ...base, is_client: true, offers: [{ ...base.offers[0], state: 'interested' }] }); showRequest();
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmer cet extra' }));
    await waitFor(() => expect(recruitmentApi).toHaveBeenCalledWith('requests/req-1/offers/1/action/', 'token', 'POST', { action: 'select' }));
    expect(screen.queryByText(/compatible\(s\) après vous/)).toBeNull();
  });
  it('une mission confirmée ne présente pas sa propre réservation comme un conflit', async () => {
    state.user = extra;
    mockRequest({ ...base, own_availability: 'unavailable', offers: [{ ...base.offers[0], state: 'selected' }] }); showRequest();
    expect(await screen.findByText(/Mission confirmée\./)).toBeTruthy();
    expect(screen.queryByText(/Vous avez une indisponibilité/)).toBeNull();
  });
  it('la correction doit être confirmée avant de préparer une facture', async () => {
    state.user = extra; mockRequest({ ...base, offers: [{ ...base.offers[0], state: 'selected', timesheet: { hours: '4', state: 'corrected', note: 'Pause', invoice_id: null } }] }); showRequest();
    expect(await screen.findByRole('button', { name: 'Confirmer la correction' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Préparer le brouillon de facture' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer la correction' }));
    await waitFor(() => expect(recruitmentApi).toHaveBeenCalledWith('requests/req-1/offers/1/timesheet/', 'token', 'POST', expect.objectContaining({ action: 'approve' })));
  });
  it('le dashboard présente les places restantes et les candidatures', async () => {
    vi.mocked(recruitmentApi).mockResolvedValue([{ ...base, is_client: true, interested_count: 1 }]);
    wrap(<RequestsSection token="token" />);
    expect(await screen.findByText(/1 candidature\(s\) · 1 place\(s\) restante\(s\)/)).toBeTruthy();
  });
});
