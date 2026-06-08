/**
 * CabinetContractSign — Mini Sprint Contracts Final
 * ---------------------------------------------------
 * Public, unauthenticated page where a customer can:
 *  1. Read the contract PDF (embedded via <iframe>)
 *  2. Accept the terms (mandatory checkbox)
 *  3. Type their full legal name as a signature
 *  4. Click “Sign” — server records IP + UA + timestamp
 *
 * Routed at /cabinet/contracts/:token (NO auth gate).
 */
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useParams } from 'react-router-dom';
import {
  ShieldCheck,
  FilePdf,
  CheckCircle,
  WarningCircle,
  Download,
  PenNib,
} from '@phosphor-icons/react';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const LIFECYCLE_TEXT = {
  draft:     { en: 'Draft', ru: 'Черновик', bg: 'Чернова' },
  sent:      { en: 'Awaiting your review', ru: 'Ждёт подписания', bg: 'Да бъде прегледана' },
  viewed:    { en: 'Awaiting your signature', ru: 'Ожидает подписи', bg: 'Очаква подпис' },
  signed:    { en: 'Signed', ru: 'Подписан', bg: 'Подписан' },
  archived:  { en: 'Archived', ru: 'Архивирован', bg: 'Архивиран' },
  cancelled: { en: 'Cancelled', ru: 'Отменён', bg: 'Отказан' },
};

const CabinetContractSign = () => {
  const { token } = useParams();
  const [contract, setContract] = useState(null);
  const [customer, setCustomer] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [accepted, setAccepted] = useState(false);
  const [fullName, setFullName] = useState('');
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await axios.get(`${API_URL}/api/contracts/view/${token}`);
        if (cancelled) return;
        setContract(data.contract);
        setCustomer(data.customer || {});
        const cust = data.customer || {};
        const full = `${cust.firstName || ''} ${cust.lastName || ''}`.trim();
        if (full) setFullName(full);
        if ((data.contract?.lifecycle) === 'signed') setSigned(true);
      } catch (e) {
        if (!cancelled) setError(e.response?.data?.detail || 'Contract not found or no longer accessible.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const submit = async () => {
    if (!accepted || !fullName.trim()) return;
    setSigning(true);
    try {
      await axios.post(
        `${API_URL}/api/contracts/view/${token}/sign`,
        { full_name: fullName.trim(), terms_accepted: true },
      );
      setSigned(true);
    } catch (e) {
      setError(e.response?.data?.detail || 'Signing failed. Please try again.');
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
      <div className="animate-spin w-10 h-10 border-2 border-[#4F46E5] border-t-transparent rounded-full" />
    </div>;
  }

  if (error && !contract) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
        <div className="bg-white border border-red-200 rounded-2xl p-8 max-w-md text-center shadow-xl" data-testid="cabinet-sign-error">
          <WarningCircle size={48} weight="duotone" className="text-red-500 mx-auto mb-3" />
          <h1 className="text-xl font-semibold text-zinc-900">Не удалось открыть договор</h1>
          <p className="mt-2 text-sm text-zinc-600">{error}</p>
        </div>
      </div>
    );
  }

  const pdfUrl = `${API_URL}/api/contracts/view/${token}/download`;
  const lc = contract?.lifecycle || 'sent';
  const lcText = LIFECYCLE_TEXT[lc]?.en || lc;

  return (
    <div className="min-h-screen bg-zinc-50 py-8 px-4" data-testid="cabinet-sign-page">
      <div className="max-w-5xl mx-auto">
        {/* Hero */}
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6 md:p-8 mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <FilePdf size={22} weight="duotone" className="text-rose-500" />
                <span className="text-[11px] uppercase tracking-wider font-bold text-zinc-500">Contract / Договор</span>
              </div>
              <h1 className="text-2xl font-bold text-zinc-900">{contract?.title || 'Service contract'}</h1>
              <p className="text-sm text-zinc-500 mt-1">
                Version <span className="font-mono">v{contract?.version || 1}</span>
                {customer?.firstName && <> · For <span className="font-medium text-zinc-700">{customer.firstName} {customer.lastName}</span></>}
              </p>
            </div>
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${signed || lc === 'signed' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
              {(signed || lc === 'signed') ? <CheckCircle size={12} weight="fill" /> : <ShieldCheck size={12} />} {signed || lc === 'signed' ? 'Signed' : lcText}
            </span>
          </div>

          {/* PDF embed */}
          <div className="mt-6 rounded-xl overflow-hidden border border-zinc-200 bg-zinc-50">
            <iframe
              title="contract-pdf"
              src={pdfUrl}
              className="w-full h-[70vh]"
              data-testid="contract-pdf-frame"
            />
          </div>
          <div className="mt-3 text-right">
            <a href={pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline">
              <Download size={14} /> Download PDF
            </a>
          </div>
        </div>

        {/* Sign block */}
        {(signed || lc === 'signed') ? (
          <div className="bg-white rounded-2xl shadow-sm border border-emerald-200 p-6 md:p-8 text-center" data-testid="contract-signed-banner">
            <CheckCircle size={48} weight="fill" className="text-emerald-500 mx-auto mb-3" />
            <h2 className="text-xl font-semibold text-zinc-900">Спасибо! Договор подписан.</h2>
            <p className="text-sm text-zinc-600 mt-2">Мы получили вашу подпись. Копия договора будет отправлена вам по эл. почте и хранится в вашем личном кабинете.</p>
            {contract?.signed_full_name && (
              <p className="mt-4 text-xs text-zinc-500">Подписал: <span className="font-mono">{contract.signed_full_name}</span></p>
            )}
            {contract?.signed_at && (
              <p className="text-xs text-zinc-400">{new Date(contract.signed_at).toLocaleString()}</p>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6 md:p-8" data-testid="contract-sign-card">
            <h2 className="text-lg font-semibold text-zinc-900 mb-1 flex items-center gap-2">
              <PenNib size={20} weight="duotone" className="text-indigo-500" /> Подписание договора
            </h2>
            <p className="text-sm text-zinc-500 mb-5">Пожалуйста, внимательно прочитайте документ выше. Для подписания примите условия и введите ваше полное имя.</p>

            <label className="flex items-start gap-3 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-1 w-4 h-4 accent-[#18181B]"
                data-testid="contract-terms-checkbox"
              />
              <span className="text-sm text-zinc-700">
                Я ознакомился с условиями договора, согласен с ними и действую добровольно.
              </span>
            </label>

            <div className="mb-5">
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Полное имя</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Иван Иванов"
                className="w-full border-2 border-zinc-200 rounded-xl px-4 py-3 text-base font-medium font-serif italic focus:outline-none focus:border-[#18181B]"
                data-testid="contract-fullname-input"
              />
              <p className="text-[11px] text-zinc-400 mt-1">Это будет вашей электронной подписью. Мы записываем дату, IP и браузер для юридического подтверждения.</p>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
            )}

            <button
              onClick={submit}
              disabled={!accepted || !fullName.trim() || signing}
              className="w-full px-4 py-3 bg-[#18181B] text-white rounded-xl hover:bg-[#27272A] disabled:opacity-50 font-semibold flex items-center justify-center gap-2"
              data-testid="contract-sign-submit"
            >
              {signing ? '…' : (<><PenNib size={16} weight="fill" /> Подписать</>)}
            </button>
          </div>
        )}

        <p className="mt-6 text-center text-[11px] text-zinc-400">
          Ссылка действует только для этого договора. BIBI Cars · Пригон автомобилей в Болгарию
        </p>
      </div>
    </div>
  );
};

export default CabinetContractSign;
