# Profitability Access Profile V2 — runbook migracji

Status: kandydat. Ten dokument nie jest zgodą na migrację ani wdrożenie.

## Nienegocjowalny łańcuch ról

Migracja nie używa wspólnej roli `migration_runner`. Jedyny dozwolony łańcuch to:

1. połączenie jako `profitability_migration_executor` (`LOGIN`, `NOINHERIT`);
2. `SET ROLE profitability_migration_runner` (`NOLOGIN`, `NOINHERIT`);
3. `SET ROLE profitability_owner` (`NOLOGIN`, `NOINHERIT`) przed DDL;
4. sesja aplikacyjna `profitability_session` (`LOGIN`, `NOINHERIT`) może wykonać
   wyłącznie `SET ROLE profitability_runtime` (`NOLOGIN`, `NOINHERIT`).

Dozwolone krawędzie członkostwa mają `SET TRUE`, `INHERIT FALSE`, `ADMIN FALSE`:

- `profitability_migration_executor -> profitability_migration_runner`;
- `profitability_migration_runner -> profitability_owner`;
- `profitability_session -> profitability_runtime`.

Wrapper wymaga dokładnie ośmiu krawędzi dotyczących sześciu ról domeny: trzech
powyższych krawędzi `SET ROLE` oraz pięciu krawędzi administracyjnych utworzonych
przez PostgreSQL 17 dla `profitability_provisioner`. Każda dodatkowa krawędź,
w tym `profitability_runtime -> profitability_owner`, kończy wykonanie przed DDL.

Role i krawędzie muszą już istnieć po Foundation V2. Wrapper niczego w tym
zakresie nie tworzy i kończy działanie przed DDL przy jakiejkolwiek rozbieżności.

## Bramka przed wykonaniem

Wymagane są jednocześnie:

- osobna zgoda produkcyjna wskazująca pełny SHA kandydata;
- świeży, zakończony sukcesem backup Cloud SQL oraz jego identyfikator;
- baza `iclean-room-database`, PostgreSQL 17, primary, read-write;
- ukończona i zweryfikowana Foundation V2 z `btree_gist`;
- dokładny graf ról powyżej, bez użycia ogólnego `migration_runner`;
- `profitability_owner` ma kolumnowe `REFERENCES` na
  `organizations(org_id)`, `organization_member(org_id, uid)` oraz
  `service_object(org_id, object_id)`; brak któregokolwiek uprawnienia kończy
  wrapper przed transakcją DDL;
- flagi `PROFITABILITY_ACCESS_PROFILE_V2_ENABLED=false` i pusta allowlista;
- wynik realnego lokalnego harnessu PG17 oraz statycznych testów;
- czysty worktree i zgodność SHA z zatwierdzonym kandydatem.

## Jedyny dozwolony entrypoint

Poświadczenie/URI podaje operator bez zapisywania go w repozytorium, logach ani
historii poleceń. Poniżej pokazano wyłącznie jawne parametry `psql`:

```text
psql -X --no-password <bezpieczne-polaczenie-jako-profitability_migration_executor> \
  -v profitability_access_expected_database=iclean-room-database \
  -v profitability_access_expected_provisioner=profitability_provisioner \
  -v profitability_access_expected_bootstrap_grantor=<exact-pg_get_userbyid-10-role> \
  -v profitability_access_expected_executor=profitability_migration_executor \
  -v profitability_access_expected_migration_runner=profitability_migration_runner \
  -v profitability_access_owner_role=profitability_owner \
  -v profitability_access_session_role=profitability_session \
  -v profitability_access_runtime_role=profitability_runtime \
  -v profitability_access_backup_reference=<zatwierdzony-backup-id> \
  -v profitability_access_confirmation=APPLY_PROFITABILITY_ACCESS_PROFILE_V2_ONLY_20260925 \
  -f dataconnect/admin/20260925_profitability_access_profile_v2_apply.psql
```

Nie uruchamiać bezpośrednio pliku z `dataconnect/migrations`.

Nadanie brakującego `REFERENCES` na tabeli źródłowej jest osobną operacją jej
właściciela/administratora i wymaga odrębnej zgody. Migracja Access Profile nie
próbuje tego uprawnienia tworzyć, nie podnosi własnych uprawnień i nie wraca do
wspólnej roli `migration_runner`.

## Gwarancje i postflight

Transakcja:

- nie seeduje organizacji, użytkowników, przypisań, celów ani markerów aktywacji;
- tworzy cztery relacje jako `profitability_owner`;
- przyznaje `profitability_runtime` tylko `USAGE` schematu i `SELECT` tabel;
- usuwa dostęp `PUBLIC` do nowych relacji;
- odrzuca stan częściowy nazwanych obiektów;
- na replayu odrzuca drift właściciela/ACL bez jego cichej naprawy;
- weryfikuje pełny zestaw kolumn, ograniczeń i indeksów, ich definicje,
  właścicieli, trwałość, RLS, polityki, triggery oraz dokładny ACL tabel;
- wymaga zerowego ACL na poziomie kolumn dla wszystkich czterech relacji i na
  replayu odrzuca obce uprawnienia kolumnowe bez ich cichej naprawy.

Po wykonaniu wymagane są: zero wierszy w czterech nowych tabelach, identyczny
fingerprint po replayu oraz nadal wyłączone flagi i pusta allowlista.

## Lokalny PostgreSQL 17

```powershell
.\scripts\test-profitability-access-profile-pg17.ps1 `
  -RunLocalEphemeralSmoke `
  -Confirmation I_CONFIRM_LOCAL_EPHEMERAL_POSTGRESQL_17_PROFITABILITY_ACCESS_PROFILE_SMOKE
```

Runner tworzy wyłącznie jednorazowy klaster na losowym porcie loopback innym niż
5432. Sprawdza Foundation V2, bezpośredni guard raw SQL, first apply, stan
częściowy, idempotentny replay, właścicieli, dokładny ACL, brak seedów oraz
odrzucenie driftu ACL tabel, ACL kolumn i grafu ról bez naprawy. Nie łączy się
z chmurą i nie wdraża kodu.

## Rollback

Nie stosować destrukcyjnego rollbacku schematu. Przy problemie transakcja ma się
wycofać, flagi pozostają `false`, allowlista pusta, a runtime dalej nie korzysta
z Access Profile V2. Odtworzenie z backupu jest procedurą awaryjną wymagającą
oddzielnej decyzji operatora.
