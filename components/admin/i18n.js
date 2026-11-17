// Serengeti Admin language: Kiswahili (default) or English.
// Strings are written in Kiswahili in the code; t() looks up the English version.
// {name} in a string is filled from the second argument: t('siku {n}', { n: 5 }).
let LANG = 'sw'
export const getLang = () => LANG
export function loadLang() {
  try { const l = window.localStorage.getItem('sa_lang'); if (l === 'en' || l === 'sw') LANG = l } catch (e) {}
  return LANG
}
export function saveLang(l) {
  LANG = l
  try { window.localStorage.setItem('sa_lang', l) } catch (e) {}
}
export function t(s, v) {
  let out = LANG === 'en' && EN[s] !== undefined ? EN[s] : s
  if (v) out = out.replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? ''))
  return out
}
export const locale = () => (LANG === 'en' ? 'en-GB' : 'sw-TZ')

export const EN = {
  // Shell
  'Takwimu': 'Analytics', 'Usajili': 'Subscriptions', 'Malipo': 'Payments', 'Wateja': 'Customers',
  'Vifurushi': 'Packages', 'Vipengele': 'Features', 'Arifa': 'Notices', 'Mipangilio': 'Settings',
  'Muhtasari wa maduka, mapato na shughuli': 'Overview of shops, income and activity',
  'Hali ya usajili wa kila duka, kuongeza muda na kusimamisha': 'Subscription status for every shop: extend or suspend',
  'Malipo yaliyopokelewa (ankara zinabaki kwenye billing admin)': 'Payments received (invoices stay in billing admin)',
  'Mawasiliano ya wateja waliojisajili': 'Contacts of registered customers',
  'POS pekee · Store pekee · Zote mbili': 'POS only · Store only · Both',
  'Tabs zinazoonekana kwa maduka yote au duka moja': 'Tabs shown to all shops or to one shop',
  'Ujumbe kwa maduka kwenye web na app': 'Messages to shops on web and app',
  'Mipango na bei, majaribio, watumiaji wa admin': 'Plans and prices, trial, admin users',
  'TheDashboard · maduka yote': 'TheDashboard · all shops',
  'Sehemu za admin': 'Admin sections',
  'Inapakia…': 'Loading…', 'Huna ruhusa': 'No access',
  'Ukurasa huu ni wa Serengeti Labs pekee.': 'This page is for Serengeti Labs only.',
  '← Duka langu': '← My shop', 'Toka': 'Log out', 'Lugha': 'Language',

  // Shared
  'Inatumika': 'Active', 'Majaribio': 'Trial', 'Imeisha': 'Expired', 'Imesimamishwa': 'Suspended',
  'siku {n} zilizopita': '{n} days ago', 'siku {n}': '{n} days',
  'Funga': 'Close', 'Tafuta duka…': 'Search shop…', 'Hifadhi': 'Save', 'Ghairi': 'Cancel',
  'Hakuna duka.': 'No shops.', 'Badilisha': 'Edit', 'Duka': 'Shop', '— chagua duka —': '— choose shop —',
  'Chagua duka': 'Choose a shop', 'POS pekee': 'POS only', 'Store pekee': 'Store only', 'Zote mbili': 'Both',
  'Maduka yote': 'All shops',

  // Analytics
  'Yanatumika': 'Active', 'Yameisha / yamesimamishwa': 'Expired / suspended', 'Mapato mwezi huu': 'Income this month',
  '{n} yameuza siku 30 zilizopita': '{n} made sales in the last 30 days',
  'Yanayotarajiwa kwa mwezi: {v}': 'Expected per month: {v}',
  'Mapato ya usajili (miezi 12)': 'Subscription income (12 months)',
  'Wateja wapya waliojisajili': 'New sign-ups',
  'Usajili unaoisha ndani ya siku 7 ({n})': 'Subscriptions ending within 7 days ({n})',
  'Ona zote →': 'See all →', 'Hakuna kwa sasa.': 'None right now.',
  'Yanayouza zaidi (siku 30)': 'Top sellers (30 days)', '{n} mauzo': '{n} sales',
  'Hatari ya kuondoka (mauzo machache siku 30)': 'Churn risk (few sales in 30 days)',
  'Mauzo ya mwisho: {d}': 'Last sale: {d}', 'hakuna': 'none',

  // Subscriptions
  'Zote': 'All', 'Zinaisha siku 7': 'Ending in 7 days', 'Zinatumika': 'Active', 'Zimeisha': 'Expired', 'Zimesimamishwa': 'Suspended',
  'Hali': 'Status', 'Mpango': 'Plan', 'Inaisha': 'Expires', 'Imebaki': 'Left', 'Imelipwa': 'Paid',
  '+ Malipo': '+ Payment',
  '{s}: imeongezwa miezi {m}': '{s}: extended by {m} months', '{s}: imehifadhiwa': '{s}: saved',
  'Usajili · {s}': 'Subscription · {s}', 'Sasa:': 'Now:', 'inaisha {d}': 'expires {d}',
  'Ongeza muda (kuanzia leo au tarehe ya kuisha, iliyo mbele)': 'Extend (from today or the expiry date, whichever is later)',
  '+{m} mwezi': '+{m} mo',
  'Kama mteja amelipa, tumia + Malipo badala yake: inarekodi malipo na kuongeza muda pamoja.': 'If the customer has paid, use + Payment instead: it records the payment and extends at once.',
  'Simamisha': 'Suspend', '— chagua —': '— choose —', '{p} · {v}/mwezi': '{p} · {v}/month',
  'Tarehe ya kuisha': 'Expiry date',
  'Kusimamisha kunaonyesha hali tu kwenye admin; hakufungi akaunti ya duka.': 'Suspending only changes the status in admin; it does not lock the shop account.',

  // Payments
  'Benki': 'Bank', 'Taslimu': 'Cash', 'Andika kiasi': 'Enter the amount',
  '{a} kutoka {s} imerekodiwa': '{a} from {s} recorded', ' · usajili hadi {d}': ' · subscription until {d}',
  'Rekodi malipo': 'Record payment', 'inaisha sasa {d}': 'currently expires {d}',
  '— bila mpango —': '— no plan —', 'Miezi inayolipiwa': 'Months paid for', 'Kiasi (TZS) *': 'Amount (TZS) *',
  'Tarehe ya malipo': 'Payment date', 'Njia': 'Method', 'Kumbukumbu (mf. namba ya muamala)': 'Reference (e.g. transaction ID)',
  'Maelezo': 'Note', 'hiari': 'optional',
  'Usajili utaongezwa miezi {m}: hadi {d}, hali "Inatumika".': 'Subscription extended by {m} months: until {d}, status "Active".',
  'Miezi 0: malipo yanarekodiwa bila kuongeza muda (mf. ada ya kuanzisha au mafunzo).': '0 months: the payment is recorded without extending (e.g. setup or training fee).',
  'Inahifadhi…': 'Saving…', 'Hifadhi malipo': 'Save payment',
  'Futa (void) malipo ya {a} kutoka {s}? Muda wa usajili hautabadilika.': 'Void the {a} payment from {s}? The subscription date will not change.',
  'Malipo yamefutwa (void)': 'Payment voided',
  'Mwezi huu': 'This month', 'Siku 90': '90 days', 'Mwaka huu': 'This year', 'Yote': 'All',
  '+ Rekodi malipo': '+ Record payment', 'Jumla ya malipo': 'Total payments', '{n} malipo': '{n} payments',
  'Tafuta duka au kumbukumbu…': 'Search shop or reference…',
  'Tarehe': 'Date', 'Kiasi': 'Amount', 'Kumbukumbu': 'Reference', 'Miezi': 'Months',
  'Hakuna malipo kipindi hiki.': 'No payments in this period.',
  'Ankara (invoices) zinabaki kwenye Serengeti billing admin. Hapa tunarekodi malipo na kuongeza muda wa usajili.': 'Invoices stay in Serengeti billing admin. Here we record payments and extend subscriptions.',

  // Customers
  'Mteja': 'Customer', 'Simu': 'Phone', 'Mahali': 'Location', 'Kifurushi': 'Package', 'Alijisajili': 'Signed up',
  'Wiki hii': 'This week', 'Siku 30': '30 days',
  'Tafuta jina, duka, simu au email…': 'Search name, shop, phone or email…',
  'Pakua CSV': 'Download CSV', 'Piga': 'Call', 'Hakuna mteja.': 'No customers.',
  'Wateja {n}': '{n} customers', 'Wenye simu {n}': '{n} with phone', 'Wenye email {n}': '{n} with email',
  'Habari {n}, karibu TheDashboard.': 'Hello {n}, welcome to TheDashboard.',
  'Wateja wapya wanaojisajili mtandaoni wanaingia hapa wenyewe, pamoja na simu, email na mahali.': 'New online sign-ups appear here automatically, with phone, email and location.',

  // Packages
  'Tafuta duka au simu…': 'Search shop or phone…', 'tangu {d}': 'since {d}', 'Kifurushi cha {s}': 'Package for {s}',
  '{s}: sasa {p}': '{s}: now {p}', 'Badilisha kifurushi?': 'Change package?',
  'Kurasa za POS (mauzo, cashier, ripoti…) zitafichwa. Data haifutwi.': 'POS pages (sales, cashier, reports…) will be hidden. No data is deleted.',
  'Store itafichwa (oda za kutoa store, pokea mzigo). Data haifutwi.': 'Store will be hidden (release orders, receiving stock). No data is deleted.',
  'Duka litaona POS na Store.': 'The shop will see POS and Store.',
  'Watumiaji wataona mabadiliko wakifungua upya ukurasa.': 'Users see the change when they reload.',
  'Ndiyo, badilisha': 'Yes, change',

  // Features
  'Vipengele vinavyoonekana': 'Visible features',
  'Zima tab kwa maduka yote, au chagua duka moja kuweka tofauti. Mabadiliko yanaonekana watumiaji wakifungua upya (web na app). Data haifutwi.': 'Turn a tab off for all shops, or pick one shop to set it differently. Users see changes when they reload (web and app). No data is deleted.',
  'Duka moja:': 'One shop:', '— Maduka yote (kwa wote) —': '— All shops (everyone) —',
  'Kipengele': 'Feature', 'Kwa wote': 'Everyone', '{n} duka lina mpangilio tofauti': '{n} shop(s) set differently',
  'Kama wote (imewashwa)': 'Like everyone (on)', 'Kama wote (imezimwa)': 'Like everyone (off)',
  'Washa': 'On', 'Zima': 'Off', 'Inaonekana': 'Visible', 'Imefichwa': 'Hidden',

  // Notices
  'Wenye POS': 'POS shops', 'Wenye Store': 'Store shops', 'POS + Store pekee': 'POS + Store only', 'Duka moja': 'One shop',
  'Duka: {s}': 'Shop: {s}', 'Andika kichwa cha ujumbe': 'Enter a title',
  'Ujumbe umetumwa. Watumiaji wataona wakifungua TheDashboard (web au app).': 'Message sent. Users will see it when they open TheDashboard (web or app).',
  'Tuma ujumbe kwa maduka': 'Send a message to shops',
  'Unaonekana juu ya ukurasa wa web na app hadi mtumiaji aufunge.': 'Shown at the top of the web and app until the user closes it.',
  'Kwa nani': 'To', 'Kichwa *': 'Title *', 'mf. Toleo jipya la TheDashboard': 'e.g. New TheDashboard release',
  'Ujumbe': 'Message', 'Maelezo mafupi': 'Short details', 'Aina': 'Type',
  'Taarifa (bluu)': 'Info (blue)', 'Tahadhari (njano)': 'Warning (yellow)', 'Ionekane hadi (hiari)': 'Show until (optional)',
  'Mfano wa jinsi itakavyoonekana:': 'Preview:', 'Inatuma…': 'Sending…', 'Tuma ujumbe': 'Send message',
  'Ujumbe uliotumwa': 'Sent messages',
  'Pia kuna kumbukumbu za moja kwa moja: duka linaona onyo usajili ukibaki siku 7, siku 1, na ukiisha.': 'Automatic reminders also go out: shops see a warning 7 days and 1 day before expiry, and after it ends.',
  'Bado hakuna ujumbe.': 'No messages yet.', 'Sitisha': 'Stop', 'Umesitishwa': 'Stopped',
  ' · hadi {d}': ' · until {d}', 'umefungwa na {n}': 'closed by {n}',

  // Settings
  'Mpango umehifadhiwa': 'Plan saved', 'Mipango na bei': 'Plans and prices', '+ Mpango': '+ Plan',
  'Bei hizi zinajaza kiasi unaporekodi malipo, na kukadiria mapato ya mwezi.': 'These prices fill in the amount when recording a payment, and estimate monthly income.',
  'Kwa mwezi': 'Per month', 'haitumiki': 'inactive', 'Jina': 'Name', 'mf. POS Pro': 'e.g. POS Pro',
  'Bei kwa mwezi (TZS)': 'Monthly price (TZS)',
  'Weka siku kati ya 1 na 180': 'Enter between 1 and 180 days',
  'Wateja wapya watapata siku {n} za majaribio': 'New customers will get a {n}-day trial',
  'Kipindi cha majaribio': 'Trial period', 'Kwa maduka mapya yanayojisajili mtandaoni.': 'For new shops that sign up online.',
  'Siku za majaribio': 'Trial days', 'siku': 'days',
  'Ameongezwa kama admin': 'Added as admin', 'Ondoa {e} kama admin?': 'Remove {e} as admin?',
  'Watumiaji wa admin': 'Admin users',
  'Wanaoweza kuingia Serengeti Admin. Akaunti lazima iwe imeshatengenezwa.': 'People who can open Serengeti Admin. The account must already exist.',
  'wewe': 'you', 'Ondoa': 'Remove', 'email ya akaunti': 'account email', 'Ongeza': 'Add',
  // Plans
  'Mipango': 'Plans', 'Bidhaa zetu: bei, vipengele, idadi ya maduka': 'Our products: price, features, number of shops',
  'Kipindi cha majaribio na watumiaji wa admin': 'Trial period and admin users',
  'Kila mpango una bei, vipengele vyake, idadi ya maduka, na kama Store imo. Duka linaona vipengele vya mpango wake tu.': "Each plan has a price, its features, a number of shops, and whether Store is included. A shop only sees its plan's features.",
  '/mwezi': '/month', 'Maduka hadi {n}': 'Up to {n} shops', 'Duka 1': '1 shop', 'Vipengele vyote': 'All features',
  'Vipengele {n}': '{n} features', 'Store imo': 'Store included', 'Maduka {n} yanatumia': '{n} shops on it', 'Haina:': 'Not included:',
  'Mpango mpya': 'New plan', 'Idadi ya maduka (matawi)': 'Number of shops (branches)',
  'Store imo (inawashwa ukiweka mpango huu)': 'Store included (turned on when this plan is set)',
  'Vipengele vilivyomo': 'Included features', 'Chagua vyote': 'Select all', 'imezimwa kwa wote': 'off for everyone',
  'Mabadiliko yanaonekana kwa maduka yote ya mpango huu wakifungua upya. Data haifutwi.': 'Changes reach every shop on this plan when they reload. No data is deleted.',
  '+{n} matawi': '+{n} branches', 'Kama mpango (imewashwa)': 'As plan (on)', 'Kama mpango (imezimwa)': 'As plan (off)',
  'Wanaolipia (kwa mpango)': 'Paying shops (by plan)',
  'Haitumiki': 'Not in use', 'mipango {n}': '{n} plans', '+ Ongeza': '+ Add', 'Bado hakuna mpango.': 'No plans yet.', 'Weka bei': 'Set a price',
}
