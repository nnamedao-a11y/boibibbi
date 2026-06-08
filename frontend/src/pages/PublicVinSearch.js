import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { 
  MagnifyingGlass, Car, Tag, Calendar, MapPin, CurrencyDollar, 
  SpinnerGap, CheckCircle, XCircle, Images, Clock, Phone, 
  EnvelopeSimple, User, CaretRight, Timer, Warning, Star
} from '@phosphor-icons/react';
import axios from 'axios';
import { useLang } from '../i18n';
const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const PublicVinSearch = () => {
  const { t } = useLang();
  const { vin: urlVin } = useParams();
  const [searchParams] = useSearchParams();
  const queryVin = searchParams.get('vin');
  
  const [vin, setVin] = useState(urlVin || queryVin || '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  
  // Lead form state
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [leadForm, setLeadForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    message: '',
  });
  const [leadSubmitting, setLeadSubmitting] = useState(false);
  const [leadSuccess, setLeadSuccess] = useState(false);
  const [leadError, setLeadError] = useState('');

  // Auto-search if VIN in URL
  useEffect(() => {
    if (urlVin && urlVin.length >= 11) {
      handleSearch(urlVin);
    }
  }, [urlVin]);

  const handleSearch = async (searchVin = vin) => {
    const vinToSearch = searchVin.trim().toUpperCase();
    
    if (!vinToSearch || vinToSearch.length < 11) {
      setError(t('invalidVin'));
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);
    setShowLeadForm(false);

    try {
      const response = await axios.get(`${API_URL}/api/public/vin/${vinToSearch}`);
      setResult(response.data);
    } catch (err) {
      setError(err.response?.data?.message || t('i18n_search_error_76ad85'));
    } finally {
      setLoading(false);
    }
  };

  const handleLeadSubmit = async (e) => {
    e.preventDefault();
    setLeadSubmitting(true);
    setLeadError('');

    try {
      const response = await axios.post(`${API_URL}/api/public/vin/lead`, {
        ...leadForm,
        vin: result?.vin || vin,
      });
      
      if (response.data.success) {
        setLeadSuccess(true);
        setShowLeadForm(false);
      } else {
        setLeadError(response.data.message);
      }
    } catch (err) {
      setLeadError(err.response?.data?.message || t('i18n_error_sending_request_8f0efd'));
    } finally {
      setLeadSubmitting(false);
    }
  };

  const formatPrice = (price) => {
    if (!price) return t('i18n_n_a_5f0039');
    return new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'USD' }).format(price);
  };

  const formatDate = (date) => {
    if (!date) return t('i18n_n_a_5f0039');
    return new Date(date).toLocaleDateString('uk-UA', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  // Auction countdown component
  const AuctionCountdown = ({ countdown }) => {
    const { t } = useLang();
    if (!countdown) return null;
    
    if (countdown.isExpired) {
      return (
        <div className="flex items-center gap-2 text-orange-400">
          <Warning size={20} />
          <span>{t('adm3_06da621719')}</span>
        </div>
      );
    }

    return (
      <div className="bg-gradient-to-r from-red-500/20 to-orange-500/20 border border-red-500/30 rounded-xl p-4">
        <div className="flex items-center gap-2 text-red-400 mb-3">
          <Timer size={24} weight="fill" />
          <span className="font-semibold">{t('adm3_e2cbf5f98e')}</span>
        </div>
        <div className="flex gap-4">
          <div className="text-center">
            <div className="text-3xl font-bold text-white">{countdown.days}</div>
            <div className="text-xs text-gray-400 uppercase">{t('adm3_e85d4cee49')}</div>
          </div>
          <div className="text-2xl text-gray-500">:</div>
          <div className="text-center">
            <div className="text-3xl font-bold text-white">{countdown.hours}</div>
            <div className="text-xs text-gray-400 uppercase">{t('adm3_fdcc60775a')}</div>
          </div>
          <div className="text-2xl text-gray-500">:</div>
          <div className="text-center">
            <div className="text-3xl font-bold text-white">{countdown.minutes}</div>
            <div className="text-xs text-gray-400 uppercase">{t('adm3_6df8218f7b')}</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0A0E17]">
      {/* Hero Section */}
      <div className="bg-gradient-to-b from-[#0D1321] to-[#0A0E17] border-b border-[#1E2530]">
        <div className="max-w-6xl mx-auto px-4 py-12">
          {/* Logo / Brand */}
          <div className="text-center mb-8">
            <Link to="/" className="inline-flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#00D4FF] to-[#0088CC] flex items-center justify-center">
                <Car size={28} weight="fill" className="text-white" />
              </div>
              <span className="text-2xl font-bold text-white">BIBI Cars</span>
            </Link>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              {t('i18n_vin_car_check_a401e3')}
            </h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              {t('i18n_free_search_for_us_auction_car_971afa')}
            </p>
          </div>

          {/* Search Form */}
          <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }} className="max-w-3xl mx-auto">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={vin}
                  onChange={(e) => setVin(e.target.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, ''))}
                  placeholder={t('i18n_enter_vin_code_17_characters_67bc49')}
                  className="w-full px-6 py-5 bg-[#1E2530] border border-[#2D3748] rounded-2xl text-white text-xl font-mono tracking-wider placeholder:text-gray-500 focus:border-[#00D4FF] focus:outline-none focus:ring-2 focus:ring-[#00D4FF]/20 transition-all"
                  maxLength={17}
                  data-testid="public-vin-search-input"
                />
                <div className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-mono">
                  {vin.length}/17
                </div>
              </div>
              <button
                type="submit"
                disabled={loading || vin.length < 11}
                className="px-10 py-5 bg-gradient-to-r from-[#00D4FF] to-[#00A3CC] text-[#0A0E17] font-bold text-lg rounded-2xl hover:shadow-xl hover:shadow-[#00D4FF]/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3"
                data-testid="public-vin-search-button"
              >
                {loading ? (
                  <SpinnerGap size={28} className="animate-spin" />
                ) : (
                  <MagnifyingGlass size={28} weight="bold" />
                )}
                {loading ? t('i18n_search_4e3f65') : t('i18n_check_9cbca9')}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Error */}
        {error && (
          <div className="mb-6 p-5 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center gap-4 text-red-400">
            <XCircle size={28} weight="fill" />
            <span className="text-lg">{error}</span>
          </div>
        )}

        {/* Lead Success Message */}
        {leadSuccess && (
          <div className="mb-6 p-6 bg-green-500/10 border border-green-500/30 rounded-2xl">
            <div className="flex items-center gap-4 text-green-400">
              <CheckCircle size={32} weight="fill" />
              <div>
                <h3 className="text-xl font-bold">{t('adm3_7ed97f3942')}</h3>
                <p className="text-green-300/80">{t('adm3_c3f2c34dc6')}</p>
              </div>
            </div>
          </div>
        )}

        {/* Result */}
        {result && result.vin && (
          <div className="bg-[#151A23] border border-[#2D3748] rounded-3xl overflow-hidden">
            {/* Vehicle Header */}
            <div className="p-6 bg-gradient-to-r from-[#1E2530] to-[#151A23] border-b border-[#2D3748]">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    {result.isAuction && (
                      <span className="px-3 py-1 bg-[#00D4FF]/20 text-[#00D4FF] text-sm font-semibold rounded-full">
                        {t('i18n_auction_75acb5')}
                      </span>
                    )}
                    <span className="px-3 py-1 bg-green-500/20 text-green-400 text-sm font-semibold rounded-full flex items-center gap-1">
                      <Star size={14} weight="fill" />
                      {result.score}% {t('i18n_quality_e3dbb1')}
                    </span>
                  </div>
                  <h2 className="text-2xl md:text-3xl font-bold text-white">
                    {result.title || `${result.year || ''} ${result.make || ''} ${result.model || ''}`.trim() || t('i18n_car_6c12ce')}
                  </h2>
                  <p className="text-gray-400 font-mono mt-1">VIN: {result.vin}</p>
                </div>
                <div className="text-right">
                  <p className="text-4xl font-bold text-[#00D4FF]">{formatPrice(result.price)}</p>
                  {result.lotNumber && (
                    <p className="text-gray-400">Lot #{result.lotNumber}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Content Grid */}
            <div className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left Column - Images */}
                <div>
                  {result.images?.length > 0 ? (
                    <div className="space-y-4">
                      <img
                        src={result.images[0]}
                        alt={result.title}
                        className="w-full h-72 object-cover rounded-2xl"
                      />
                      {result.images.length > 1 && (
                        <div className="grid grid-cols-4 gap-2">
                          {result.images.slice(1, 5).map((img, idx) => (
                            <img
                              key={idx}
                              src={img}
                              alt={`${result.title} ${idx + 2}`}
                              className="w-full h-20 object-cover rounded-lg opacity-80 hover:opacity-100 transition-opacity cursor-pointer"
                            />
                          ))}
                        </div>
                      )}
                      {result.images.length > 5 && (
                        <p className="text-gray-400 text-sm flex items-center gap-2">
                          <Images size={16} />
                          +{result.images.length - 5} {t('i18n_photo_499056')}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="w-full h-72 bg-[#1E2530] rounded-2xl flex items-center justify-center">
                      <Car size={80} className="text-gray-600" />
                    </div>
                  )}

                  {/* Auction Countdown */}
                  {result.auctionCountdown && (
                    <div className="mt-6">
                      <AuctionCountdown countdown={result.auctionCountdown} />
                    </div>
                  )}
                </div>

                {/* Right Column - Details & CTA */}
                <div className="space-y-6">
                  {/* Specs Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-[#1E2530] rounded-xl">
                      <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">{t('adm3_327c012ed8')}</p>
                      <p className="text-white text-xl font-semibold">{result.year || t('i18n_n_a_5f0039')}</p>
                    </div>
                    <div className="p-4 bg-[#1E2530] rounded-xl">
                      <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">{t('adm3_23ad2019e1')}</p>
                      <p className="text-white text-xl font-semibold">
                        {result.mileage ? `${parseInt(result.mileage).toLocaleString()} mi` : t('i18n_n_a_5f0039')}
                      </p>
                    </div>
                    <div className="p-4 bg-[#1E2530] rounded-xl">
                      <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">{t('adm3_eefdb699e8')}</p>
                      <p className="text-white text-xl font-semibold capitalize">{result.damageType || t('i18n_n_a_5f0039')}</p>
                    </div>
                    <div className="p-4 bg-[#1E2530] rounded-xl flex items-start gap-3">
                      <Calendar size={24} className="text-[#00D4FF] mt-0.5" />
                      <div>
                        <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">{t('adm3_c0be3e08c4')}</p>
                        <p className="text-white font-semibold">{formatDate(result.saleDate)}</p>
                      </div>
                    </div>
                    <div className="p-4 bg-[#1E2530] rounded-xl col-span-2 flex items-start gap-3">
                      <MapPin size={24} className="text-[#00D4FF] mt-0.5" />
                      <div>
                        <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">{t('adm3_465d9dd961')}</p>
                        <p className="text-white font-semibold">{result.location || t('i18n_usa_b7e7df')}</p>
                      </div>
                    </div>
                  </div>

                  {/* CTA Button */}
                  {!showLeadForm && !leadSuccess && (
                    <button
                      onClick={() => setShowLeadForm(true)}
                      className="w-full py-5 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold text-xl rounded-2xl hover:shadow-xl hover:shadow-green-500/30 transition-all flex items-center justify-center gap-3"
                      data-testid="want-to-buy-button"
                    >
                      <Car size={28} weight="fill" />
                      {t('i18n_i_want_to_buy_this_car_c309b6')}
                      <CaretRight size={24} weight="bold" />
                    </button>
                  )}

                  {/* Lead Form */}
                  {showLeadForm && (
                    <form onSubmit={handleLeadSubmit} className="bg-[#1E2530] rounded-2xl p-6 border border-[#2D3748]">
                      <h3 className="text-xl font-bold text-white mb-4">{t('adm3_b9ce191c86')}</h3>
                      
                      {leadError && (
                        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                          {leadError}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="block text-gray-400 text-sm mb-2">{t('adm3_4cd9f366fb')}</label>
                          <div className="relative">
                            <User size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                              type="text"
                              value={leadForm.firstName}
                              onChange={(e) => setLeadForm({ ...leadForm, firstName: e.target.value })}
                              className="w-full pl-12 pr-4 py-3 bg-[#0A0E17] border border-[#2D3748] rounded-xl text-white focus:border-[#00D4FF] focus:outline-none"
                              placeholder={t('i18n_ivan_e2b860')}
                              required
                              data-testid="lead-firstname"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-gray-400 text-sm mb-2">{t('adm3_de25a06db6')}</label>
                          <input
                            type="text"
                            value={leadForm.lastName}
                            onChange={(e) => setLeadForm({ ...leadForm, lastName: e.target.value })}
                            className="w-full px-4 py-3 bg-[#0A0E17] border border-[#2D3748] rounded-xl text-white focus:border-[#00D4FF] focus:outline-none"
                            placeholder={t('i18n_petrenko_e75cdd')}
                            required
                            data-testid="lead-lastname"
                          />
                        </div>
                      </div>

                      <div className="mb-4">
                        <label className="block text-gray-400 text-sm mb-2">Email *</label>
                        <div className="relative">
                          <EnvelopeSimple size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                          <input
                            type="email"
                            value={leadForm.email}
                            onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })}
                            className="w-full pl-12 pr-4 py-3 bg-[#0A0E17] border border-[#2D3748] rounded-xl text-white focus:border-[#00D4FF] focus:outline-none"
                            placeholder="email@example.com"
                            required
                            data-testid="lead-email"
                          />
                        </div>
                      </div>

                      <div className="mb-4">
                        <label className="block text-gray-400 text-sm mb-2">{t('adm3_8ae5d05e0d')}</label>
                        <div className="relative">
                          <Phone size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                          <input
                            type="tel"
                            value={leadForm.phone}
                            onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })}
                            className="w-full pl-12 pr-4 py-3 bg-[#0A0E17] border border-[#2D3748] rounded-xl text-white focus:border-[#00D4FF] focus:outline-none"
                            placeholder="+380 XX XXX XX XX"
                            required
                            data-testid="lead-phone"
                          />
                        </div>
                      </div>

                      <div className="mb-6">
                        <label className="block text-gray-400 text-sm mb-2">{t('adm3_4f170b1334')}</label>
                        <textarea
                          value={leadForm.message}
                          onChange={(e) => setLeadForm({ ...leadForm, message: e.target.value })}
                          className="w-full px-4 py-3 bg-[#0A0E17] border border-[#2D3748] rounded-xl text-white focus:border-[#00D4FF] focus:outline-none resize-none"
                          rows={3}
                          placeholder={t('i18n_your_questions_or_suggestions_5eb058')}
                          data-testid="lead-message"
                        />
                      </div>

                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setShowLeadForm(false)}
                          className="flex-1 py-4 bg-[#2D3748] text-white font-semibold rounded-xl hover:bg-[#3D4758] transition-colors"
                        >
                          {t('i18n_cancel_d9cfba')}
                        </button>
                        <button
                          type="submit"
                          disabled={leadSubmitting}
                          className="flex-1 py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold rounded-xl hover:shadow-lg disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                          data-testid="submit-lead-button"
                        >
                          {leadSubmitting ? (
                            <SpinnerGap size={24} className="animate-spin" />
                          ) : (
                            <>
                              <CheckCircle size={24} />
                              {t('i18n_send_0903a5')}
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Sources */}
                  {result.sources && result.sources.length > 0 && (
                    <div className="pt-4 border-t border-[#2D3748]">
                      <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">{t('adm3_0ce5babf69')}</p>
                      <div className="flex flex-wrap gap-2">
                        {result.sources.map((src, idx) => (
                          <span key={idx} className="px-3 py-1 bg-[#1E2530] rounded-full text-sm text-gray-300 capitalize">
                            {src}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Source URL */}
                  {result.sourceUrl && (
                    <a
                      href={result.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-[#00D4FF] hover:underline"
                    >
                      {t('i18n_view_on_source_1ba3b1')}
                      <CaretRight size={16} />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Not Found State */}
        {result && !result.vin && !result.success && (
          <div className="bg-[#151A23] border border-[#2D3748] rounded-3xl p-12">
            {!showLeadForm && !leadSuccess ? (
              <div className="text-center">
                <Car size={80} className="mx-auto text-gray-600 mb-6" />
                <h3 className="text-2xl text-white font-bold mb-3">
                  {t('i18n_information_not_found_efbc45')}
                </h3>
                <p className="text-gray-400 max-w-md mx-auto mb-6">
                  {result.message || t('i18n_the_system_did_not_find_inform_a7b097')}
                </p>
                <button
                  onClick={() => setShowLeadForm(true)}
                  className="px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold rounded-xl hover:shadow-lg transition-all"
                  data-testid="ask-about-car-button"
                >
                  {t('i18n_inquire_about_the_car_d4f61a')}
                </button>
              </div>
            ) : showLeadForm && !leadSuccess ? (
              <form onSubmit={handleLeadSubmit} className="max-w-xl mx-auto">
                <h3 className="text-2xl font-bold text-white mb-6 text-center">{t('adm3_dbc240ce24')}</h3>
                <p className="text-gray-400 text-center mb-6">VIN: <span className="font-mono text-[#00D4FF]">{vin}</span></p>
                
                {leadError && (
                  <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                    {leadError}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">{t('adm3_4cd9f366fb')}</label>
                    <div className="relative">
                      <User size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                      <input
                        type="text"
                        value={leadForm.firstName}
                        onChange={(e) => setLeadForm({ ...leadForm, firstName: e.target.value })}
                        className="w-full pl-12 pr-4 py-3 bg-[#0A0E17] border border-[#2D3748] rounded-xl text-white focus:border-[#00D4FF] focus:outline-none"
                        placeholder={t('i18n_ivan_e2b860')}
                        required
                        data-testid="notfound-lead-firstname"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">{t('adm3_de25a06db6')}</label>
                    <input
                      type="text"
                      value={leadForm.lastName}
                      onChange={(e) => setLeadForm({ ...leadForm, lastName: e.target.value })}
                      className="w-full px-4 py-3 bg-[#0A0E17] border border-[#2D3748] rounded-xl text-white focus:border-[#00D4FF] focus:outline-none"
                      placeholder={t('i18n_petrenko_e75cdd')}
                      required
                      data-testid="notfound-lead-lastname"
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-gray-400 text-sm mb-2">Email *</label>
                  <div className="relative">
                    <EnvelopeSimple size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                      type="email"
                      value={leadForm.email}
                      onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })}
                      className="w-full pl-12 pr-4 py-3 bg-[#0A0E17] border border-[#2D3748] rounded-xl text-white focus:border-[#00D4FF] focus:outline-none"
                      placeholder="email@example.com"
                      required
                      data-testid="notfound-lead-email"
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-gray-400 text-sm mb-2">{t('adm3_8ae5d05e0d')}</label>
                  <div className="relative">
                    <Phone size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                      type="tel"
                      value={leadForm.phone}
                      onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })}
                      className="w-full pl-12 pr-4 py-3 bg-[#0A0E17] border border-[#2D3748] rounded-xl text-white focus:border-[#00D4FF] focus:outline-none"
                      placeholder="+380 XX XXX XX XX"
                      required
                      data-testid="notfound-lead-phone"
                    />
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-gray-400 text-sm mb-2">{t('adm3_4f170b1334')}</label>
                  <textarea
                    value={leadForm.message}
                    onChange={(e) => setLeadForm({ ...leadForm, message: e.target.value })}
                    className="w-full px-4 py-3 bg-[#0A0E17] border border-[#2D3748] rounded-xl text-white focus:border-[#00D4FF] focus:outline-none resize-none"
                    rows={3}
                    placeholder={t('i18n_your_questions_or_suggestions_5eb058')}
                    data-testid="notfound-lead-message"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowLeadForm(false)}
                    className="flex-1 py-4 bg-[#2D3748] text-white font-semibold rounded-xl hover:bg-[#3D4758] transition-colors"
                  >
                    {t('i18n_cancel_d9cfba')}
                  </button>
                  <button
                    type="submit"
                    disabled={leadSubmitting}
                    className="flex-1 py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold rounded-xl hover:shadow-lg disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                    data-testid="notfound-submit-lead-button"
                  >
                    {leadSubmitting ? (
                      <SpinnerGap size={24} className="animate-spin" />
                    ) : (
                      <>
                        <CheckCircle size={24} />
                        {t('i18n_send_0903a5')}
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        )}

        {/* Features Section */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 bg-[#151A23] border border-[#2D3748] rounded-2xl text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-green-500/20 flex items-center justify-center">
              <CheckCircle size={32} className="text-green-500" />
            </div>
            <h3 className="text-white font-bold text-lg mb-2">{t('adm3_66a8412995')}</h3>
            <p className="text-gray-400">
              {t('i18n_vin_code_verification_is_compl_4838fe')}
            </p>
          </div>
          <div className="p-6 bg-[#151A23] border border-[#2D3748] rounded-2xl text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#00D4FF]/20 flex items-center justify-center">
              <MagnifyingGlass size={32} className="text-[#00D4FF]" />
            </div>
            <h3 className="text-white font-bold text-lg mb-2">{t('adm3_20_ffd2a8979c')}</h3>
            <p className="text-gray-400">
              {t('i18n_searching_on_copart_iaai_and_o_316aad')}
            </p>
          </div>
          <div className="p-6 bg-[#151A23] border border-[#2D3748] rounded-2xl text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-yellow-500/20 flex items-center justify-center">
              <Clock size={32} className="text-yellow-500" />
            </div>
            <h3 className="text-white font-bold text-lg mb-2">{t('adm3_160eb4a97e')}</h3>
            <p className="text-gray-400">
              {t('i18n_result_in_seconds_d54b9c')}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 text-center text-gray-500 text-sm">
          <p>{t('adm3_2026_bibi_cars_4382ba130d')}</p>
          <p className="mt-2">
            <Link to="/login" className="text-[#00D4FF] hover:underline">{t('adm3_d4965cd885')}</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default PublicVinSearch;
