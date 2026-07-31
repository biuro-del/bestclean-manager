# Architektura panelu platformy

## Przepływ żądania

1. Portal pobiera token bieżącego użytkownika z istniejącego Firebase Auth.
2. Backend weryfikuje token i sprawdza claim, email, MFA, świeżość uwierzytelnienia oraz aktywny rekord `platform_admin`.
3. Lista i dashboard są dostępne wyłącznie dla PLATFORM_OWNER. Dane pojedynczej organizacji wymagają dodatkowo aktywnego kontekstu utworzonego z powodem.
4. Podgląd operacji wylicza `before`, `after` i `expectedVersion`, ale niczego nie zapisuje.
5. Potwierdzenie zapisuje `REQUESTED`. Następnie backend blokuje rekordy, sprawdza wersję i wykonuje zmianę oraz `SUCCEEDED` w jednej transakcji SQL. Po rollbacku dopisywane jest `FAILED`.

## Model danych

Migracja zachowuje `organizations` i `organization_subscription`. Dodaje wyłącznie brakujące kolumny oraz tabele:

- `platform_plan` — katalog TRIAL, START i PRO wraz z opcjonalną ceną;
- `organization_subscription_history` — append-only historia planu i statusu;
- `organization_billing_account` — przyszłe powiązanie klienta z operatorem;
- `billing_transaction` — płatności, zwroty i korekty;
- `billing_transaction_event` — append-only zdarzenia transakcji;
- `billing_document` — faktury i inne dokumenty rozliczeniowe.

Kwoty są przechowywane jako `BIGINT`, a waluta jako kod trzyliterowy. Historyczne braki danych są poprawnym pustym stanem. Ceny planów START i PRO są początkowo puste, dlatego MRR pozostaje niedostępny, dopóki oba aktywne plany nie otrzymają kompletnej ceny miesięcznej.

## Adapter operatora płatności

`BillingProviderAdapter` definiuje granicę dla klienta, subskrypcji, anulowania, zwrotu i webhooka. Aktualny `NoopBillingProvider` ma wszystkie możliwości wyłączone i nigdy nie wykonuje zewnętrznego pobrania. Przyszła implementacja Stripe, Przelewy24 lub innego operatora powinna:

1. implementować ten interfejs w osobnym pliku;
2. mapować zewnętrzne ID do istniejących pól `provider_*`;
3. zapisywać zdarzenia jako `source=PROVIDER`;
4. deduplikować webhooki i polecenia kluczem idempotencji;
5. nie udostępniać sekretów frontendowi;
6. zostać zarejestrowana w `provider-registry.js` bez zmiany API panelu ani schematu bazowego.

## Kompatybilność

Stare rekordy `organization_subscription` pozostają prawidłowe. Nowe pola mają wartości domyślne albo dopuszczają `NULL`. Lista organizacji ma kontrolowany tryb zgodności, kiedy migracja rozliczeń nie została jeszcze uruchomiona; widoki finansowe zwracają wtedy jasny komunikat zamiast niepełnych danych.
