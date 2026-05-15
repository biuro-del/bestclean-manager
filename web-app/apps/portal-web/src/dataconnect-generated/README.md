# Generated TypeScript README
This README will guide you through the process of using the generated JavaScript SDK package for the connector `example`. It will also provide examples on how to use your generated SDK to call your Data Connect queries and mutations.

**If you're looking for the `React README`, you can find it at [`dataconnect-generated/react/README.md`](./react/README.md)**

***NOTE:** This README is generated alongside the generated SDK. If you make changes to this file, they will be overwritten when the SDK is regenerated.*

# Table of Contents
- [**Overview**](#generated-javascript-readme)
- [**Accessing the connector**](#accessing-the-connector)
  - [*Connecting to the local Emulator*](#connecting-to-the-local-emulator)
- [**Queries**](#queries)
  - [*MyOrganizations*](#myorganizations)
  - [*OrgUiStyleForOrg*](#orguistylefororg)
  - [*MyUiStylePreference*](#myuistylepreference)
  - [*UserUiStylePreferencesForOrg*](#useruistylepreferencesfororg)
  - [*CanManageWorkersForOrg*](#canmanageworkersfororg)
  - [*WorkersForOrg*](#workersfororg)
  - [*AdminWorkerCredentialForOrg*](#adminworkercredentialfororg)
  - [*ClientsForOrg*](#clientsfororg)
  - [*IndividualJobsForOrg*](#individualjobsfororg)
  - [*ZonesForOrg*](#zonesfororg)
  - [*WorkdaysForOrg*](#workdaysfororg)
  - [*BackupCyclesForOrg*](#backupcyclesfororg)
  - [*EventsForOrg*](#eventsfororg)
  - [*WorkerWorkdaysForOrg*](#workerworkdaysfororg)
  - [*StorageForOrg*](#storagefororg)
  - [*ClientStorageForClient*](#clientstorageforclient)
  - [*ClientStorageForOrg*](#clientstoragefororg)
  - [*WorkdayPausesForOrg*](#workdaypausesfororg)
  - [*ActiveWorkdayPauseForWorker*](#activeworkdaypauseforworker)
- [**Mutations**](#mutations)
  - [*InsertWorkerForOrg*](#insertworkerfororg)
  - [*InsertWorkerWithMembershipForOrg*](#insertworkerwithmembershipfororg)
  - [*UpdateWorkerForOrg*](#updateworkerfororg)
  - [*UpsertWorkerCredentialForOrg*](#upsertworkercredentialfororg)
  - [*UpsertOrgUiStyleForOrg*](#upsertorguistylefororg)
  - [*DeleteOrgUiStyleForOrg*](#deleteorguistylefororg)
  - [*UpsertMyUiStylePreference*](#upsertmyuistylepreference)
  - [*DeleteMyUiStylePreference*](#deletemyuistylepreference)
  - [*UpsertUserUiStylePreferenceForOrg*](#upsertuseruistylepreferencefororg)
  - [*DeleteUserUiStylePreferenceForOrg*](#deleteuseruistylepreferencefororg)
  - [*InsertClientForOrg*](#insertclientfororg)
  - [*UpdateClientForOrg*](#updateclientfororg)
  - [*DeleteClientForOrg*](#deleteclientfororg)
  - [*InsertIndividualJobForOrg*](#insertindividualjobfororg)
  - [*UpdateIndividualJobForOrg*](#updateindividualjobfororg)
  - [*DeleteIndividualJobForOrg*](#deleteindividualjobfororg)
  - [*InsertZoneForOrg*](#insertzonefororg)
  - [*UpdateZoneForOrg*](#updatezonefororg)
  - [*DeleteZoneForOrg*](#deletezonefororg)
  - [*InsertWorkdayForOrg*](#insertworkdayfororg)
  - [*UpdateWorkdayForOrg*](#updateworkdayfororg)
  - [*DeleteWorkdayForOrg*](#deleteworkdayfororg)
  - [*InsertEventForOrg*](#inserteventfororg)
  - [*UpdateEventForOrg*](#updateeventfororg)
  - [*DeleteEventForOrg*](#deleteeventfororg)
  - [*InsertBackupCycleForOrg*](#insertbackupcyclefororg)
  - [*UpdateBackupCycleForOrg*](#updatebackupcyclefororg)
  - [*InsertStorageForOrg*](#insertstoragefororg)
  - [*UpdateStorageForOrg*](#updatestoragefororg)
  - [*DeleteStorageForOrg*](#deletestoragefororg)
  - [*InsertClientStorageForOrg*](#insertclientstoragefororg)
  - [*UpdateClientStorageForOrg*](#updateclientstoragefororg)
  - [*DeleteClientStorageForOrg*](#deleteclientstoragefororg)
  - [*StartWorkdayPause*](#startworkdaypause)
  - [*StopWorkdayPause*](#stopworkdaypause)

# Accessing the connector
A connector is a collection of Queries and Mutations. One SDK is generated for each connector - this SDK is generated for the connector `example`. You can find more information about connectors in the [Data Connect documentation](https://firebase.google.com/docs/data-connect#how-does).

You can use this generated SDK by importing from the package `@dataconnect/generated` as shown below. Both CommonJS and ESM imports are supported.

You can also follow the instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#set-client).

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

const dataConnect = getDataConnect(connectorConfig);
```

## Connecting to the local Emulator
By default, the connector will connect to the production service.

To connect to the emulator, you can use the following code.
You can also follow the emulator instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#instrument-clients).

```typescript
import { connectDataConnectEmulator, getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

const dataConnect = getDataConnect(connectorConfig);
connectDataConnectEmulator(dataConnect, 'localhost', 9399);
```

After it's initialized, you can call your Data Connect [queries](#queries) and [mutations](#mutations) from your generated SDK.

# Queries

There are two ways to execute a Data Connect Query using the generated Web SDK:
- Using a Query Reference function, which returns a `QueryRef`
  - The `QueryRef` can be used as an argument to `executeQuery()`, which will execute the Query and return a `QueryPromise`
- Using an action shortcut function, which returns a `QueryPromise`
  - Calling the action shortcut function will execute the Query and return a `QueryPromise`

The following is true for both the action shortcut function and the `QueryRef` function:
- The `QueryPromise` returned will resolve to the result of the Query once it has finished executing
- If the Query accepts arguments, both the action shortcut function and the `QueryRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Query
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `example` connector's generated functions to execute each query. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-queries).

## MyOrganizations
You can execute the `MyOrganizations` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
myOrganizations(options?: ExecuteQueryOptions): QueryPromise<MyOrganizationsData, undefined>;

interface MyOrganizationsRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<MyOrganizationsData, undefined>;
}
export const myOrganizationsRef: MyOrganizationsRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
myOrganizations(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<MyOrganizationsData, undefined>;

interface MyOrganizationsRef {
  ...
  (dc: DataConnect): QueryRef<MyOrganizationsData, undefined>;
}
export const myOrganizationsRef: MyOrganizationsRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the myOrganizationsRef:
```typescript
const name = myOrganizationsRef.operationName;
console.log(name);
```

### Variables
The `MyOrganizations` query has no variables.
### Return Type
Recall that executing the `MyOrganizations` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `MyOrganizationsData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface MyOrganizationsData {
  organizationMembers: ({
    orgId: string;
    role: string;
    organization: {
      orgId: string;
      name: string;
      status?: string | null;
    } & Organization_Key;
  })[];
}
```
### Using `MyOrganizations`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, myOrganizations } from '@dataconnect/generated';


// Call the `myOrganizations()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await myOrganizations();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await myOrganizations(dataConnect);

console.log(data.organizationMembers);

// Or, you can use the `Promise` API.
myOrganizations().then((response) => {
  const data = response.data;
  console.log(data.organizationMembers);
});
```

### Using `MyOrganizations`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, myOrganizationsRef } from '@dataconnect/generated';


// Call the `myOrganizationsRef()` function to get a reference to the query.
const ref = myOrganizationsRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = myOrganizationsRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.organizationMembers);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.organizationMembers);
});
```

## OrgUiStyleForOrg
You can execute the `OrgUiStyleForOrg` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
orgUiStyleForOrg(vars: OrgUiStyleForOrgVariables, options?: ExecuteQueryOptions): QueryPromise<OrgUiStyleForOrgData, OrgUiStyleForOrgVariables>;

interface OrgUiStyleForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: OrgUiStyleForOrgVariables): QueryRef<OrgUiStyleForOrgData, OrgUiStyleForOrgVariables>;
}
export const orgUiStyleForOrgRef: OrgUiStyleForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
orgUiStyleForOrg(dc: DataConnect, vars: OrgUiStyleForOrgVariables, options?: ExecuteQueryOptions): QueryPromise<OrgUiStyleForOrgData, OrgUiStyleForOrgVariables>;

interface OrgUiStyleForOrgRef {
  ...
  (dc: DataConnect, vars: OrgUiStyleForOrgVariables): QueryRef<OrgUiStyleForOrgData, OrgUiStyleForOrgVariables>;
}
export const orgUiStyleForOrgRef: OrgUiStyleForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the orgUiStyleForOrgRef:
```typescript
const name = orgUiStyleForOrgRef.operationName;
console.log(name);
```

### Variables
The `OrgUiStyleForOrg` query requires an argument of type `OrgUiStyleForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface OrgUiStyleForOrgVariables {
  orgId: string;
}
```
### Return Type
Recall that executing the `OrgUiStyleForOrg` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `OrgUiStyleForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface OrgUiStyleForOrgData {
  orgUiStyle?: {
    orgId: string;
    defaultStyleId: string;
    updatedAt: TimestampString;
    updatedBy?: string | null;
  } & OrgUiStyle_Key;
}
```
### Using `OrgUiStyleForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, orgUiStyleForOrg, OrgUiStyleForOrgVariables } from '@dataconnect/generated';

// The `OrgUiStyleForOrg` query requires an argument of type `OrgUiStyleForOrgVariables`:
const orgUiStyleForOrgVars: OrgUiStyleForOrgVariables = {
  orgId: ..., 
};

// Call the `orgUiStyleForOrg()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await orgUiStyleForOrg(orgUiStyleForOrgVars);
// Variables can be defined inline as well.
const { data } = await orgUiStyleForOrg({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await orgUiStyleForOrg(dataConnect, orgUiStyleForOrgVars);

console.log(data.orgUiStyle);

// Or, you can use the `Promise` API.
orgUiStyleForOrg(orgUiStyleForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.orgUiStyle);
});
```

### Using `OrgUiStyleForOrg`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, orgUiStyleForOrgRef, OrgUiStyleForOrgVariables } from '@dataconnect/generated';

// The `OrgUiStyleForOrg` query requires an argument of type `OrgUiStyleForOrgVariables`:
const orgUiStyleForOrgVars: OrgUiStyleForOrgVariables = {
  orgId: ..., 
};

// Call the `orgUiStyleForOrgRef()` function to get a reference to the query.
const ref = orgUiStyleForOrgRef(orgUiStyleForOrgVars);
// Variables can be defined inline as well.
const ref = orgUiStyleForOrgRef({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = orgUiStyleForOrgRef(dataConnect, orgUiStyleForOrgVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.orgUiStyle);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.orgUiStyle);
});
```

## MyUiStylePreference
You can execute the `MyUiStylePreference` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
myUiStylePreference(vars: MyUiStylePreferenceVariables, options?: ExecuteQueryOptions): QueryPromise<MyUiStylePreferenceData, MyUiStylePreferenceVariables>;

interface MyUiStylePreferenceRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: MyUiStylePreferenceVariables): QueryRef<MyUiStylePreferenceData, MyUiStylePreferenceVariables>;
}
export const myUiStylePreferenceRef: MyUiStylePreferenceRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
myUiStylePreference(dc: DataConnect, vars: MyUiStylePreferenceVariables, options?: ExecuteQueryOptions): QueryPromise<MyUiStylePreferenceData, MyUiStylePreferenceVariables>;

interface MyUiStylePreferenceRef {
  ...
  (dc: DataConnect, vars: MyUiStylePreferenceVariables): QueryRef<MyUiStylePreferenceData, MyUiStylePreferenceVariables>;
}
export const myUiStylePreferenceRef: MyUiStylePreferenceRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the myUiStylePreferenceRef:
```typescript
const name = myUiStylePreferenceRef.operationName;
console.log(name);
```

### Variables
The `MyUiStylePreference` query requires an argument of type `MyUiStylePreferenceVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface MyUiStylePreferenceVariables {
  orgId: string;
}
```
### Return Type
Recall that executing the `MyUiStylePreference` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `MyUiStylePreferenceData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface MyUiStylePreferenceData {
  userUiStylePreference?: {
    orgId: string;
    uid: string;
    styleId: string;
    updatedAt: TimestampString;
    updatedBy?: string | null;
  } & UserUiStylePreference_Key;
}
```
### Using `MyUiStylePreference`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, myUiStylePreference, MyUiStylePreferenceVariables } from '@dataconnect/generated';

// The `MyUiStylePreference` query requires an argument of type `MyUiStylePreferenceVariables`:
const myUiStylePreferenceVars: MyUiStylePreferenceVariables = {
  orgId: ..., 
};

// Call the `myUiStylePreference()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await myUiStylePreference(myUiStylePreferenceVars);
// Variables can be defined inline as well.
const { data } = await myUiStylePreference({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await myUiStylePreference(dataConnect, myUiStylePreferenceVars);

console.log(data.userUiStylePreference);

// Or, you can use the `Promise` API.
myUiStylePreference(myUiStylePreferenceVars).then((response) => {
  const data = response.data;
  console.log(data.userUiStylePreference);
});
```

### Using `MyUiStylePreference`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, myUiStylePreferenceRef, MyUiStylePreferenceVariables } from '@dataconnect/generated';

// The `MyUiStylePreference` query requires an argument of type `MyUiStylePreferenceVariables`:
const myUiStylePreferenceVars: MyUiStylePreferenceVariables = {
  orgId: ..., 
};

// Call the `myUiStylePreferenceRef()` function to get a reference to the query.
const ref = myUiStylePreferenceRef(myUiStylePreferenceVars);
// Variables can be defined inline as well.
const ref = myUiStylePreferenceRef({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = myUiStylePreferenceRef(dataConnect, myUiStylePreferenceVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.userUiStylePreference);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.userUiStylePreference);
});
```

## UserUiStylePreferencesForOrg
You can execute the `UserUiStylePreferencesForOrg` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
userUiStylePreferencesForOrg(vars: UserUiStylePreferencesForOrgVariables, options?: ExecuteQueryOptions): QueryPromise<UserUiStylePreferencesForOrgData, UserUiStylePreferencesForOrgVariables>;

interface UserUiStylePreferencesForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: UserUiStylePreferencesForOrgVariables): QueryRef<UserUiStylePreferencesForOrgData, UserUiStylePreferencesForOrgVariables>;
}
export const userUiStylePreferencesForOrgRef: UserUiStylePreferencesForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
userUiStylePreferencesForOrg(dc: DataConnect, vars: UserUiStylePreferencesForOrgVariables, options?: ExecuteQueryOptions): QueryPromise<UserUiStylePreferencesForOrgData, UserUiStylePreferencesForOrgVariables>;

interface UserUiStylePreferencesForOrgRef {
  ...
  (dc: DataConnect, vars: UserUiStylePreferencesForOrgVariables): QueryRef<UserUiStylePreferencesForOrgData, UserUiStylePreferencesForOrgVariables>;
}
export const userUiStylePreferencesForOrgRef: UserUiStylePreferencesForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the userUiStylePreferencesForOrgRef:
```typescript
const name = userUiStylePreferencesForOrgRef.operationName;
console.log(name);
```

### Variables
The `UserUiStylePreferencesForOrg` query requires an argument of type `UserUiStylePreferencesForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface UserUiStylePreferencesForOrgVariables {
  orgId: string;
}
```
### Return Type
Recall that executing the `UserUiStylePreferencesForOrg` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `UserUiStylePreferencesForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface UserUiStylePreferencesForOrgData {
  userUiStylePreferences: ({
    orgId: string;
    uid: string;
    styleId: string;
    updatedAt: TimestampString;
    updatedBy?: string | null;
  } & UserUiStylePreference_Key)[];
}
```
### Using `UserUiStylePreferencesForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, userUiStylePreferencesForOrg, UserUiStylePreferencesForOrgVariables } from '@dataconnect/generated';

// The `UserUiStylePreferencesForOrg` query requires an argument of type `UserUiStylePreferencesForOrgVariables`:
const userUiStylePreferencesForOrgVars: UserUiStylePreferencesForOrgVariables = {
  orgId: ..., 
};

// Call the `userUiStylePreferencesForOrg()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await userUiStylePreferencesForOrg(userUiStylePreferencesForOrgVars);
// Variables can be defined inline as well.
const { data } = await userUiStylePreferencesForOrg({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await userUiStylePreferencesForOrg(dataConnect, userUiStylePreferencesForOrgVars);

console.log(data.userUiStylePreferences);

// Or, you can use the `Promise` API.
userUiStylePreferencesForOrg(userUiStylePreferencesForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.userUiStylePreferences);
});
```

### Using `UserUiStylePreferencesForOrg`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, userUiStylePreferencesForOrgRef, UserUiStylePreferencesForOrgVariables } from '@dataconnect/generated';

// The `UserUiStylePreferencesForOrg` query requires an argument of type `UserUiStylePreferencesForOrgVariables`:
const userUiStylePreferencesForOrgVars: UserUiStylePreferencesForOrgVariables = {
  orgId: ..., 
};

// Call the `userUiStylePreferencesForOrgRef()` function to get a reference to the query.
const ref = userUiStylePreferencesForOrgRef(userUiStylePreferencesForOrgVars);
// Variables can be defined inline as well.
const ref = userUiStylePreferencesForOrgRef({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = userUiStylePreferencesForOrgRef(dataConnect, userUiStylePreferencesForOrgVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.userUiStylePreferences);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.userUiStylePreferences);
});
```

## CanManageWorkersForOrg
You can execute the `CanManageWorkersForOrg` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
canManageWorkersForOrg(vars: CanManageWorkersForOrgVariables, options?: ExecuteQueryOptions): QueryPromise<CanManageWorkersForOrgData, CanManageWorkersForOrgVariables>;

interface CanManageWorkersForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: CanManageWorkersForOrgVariables): QueryRef<CanManageWorkersForOrgData, CanManageWorkersForOrgVariables>;
}
export const canManageWorkersForOrgRef: CanManageWorkersForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
canManageWorkersForOrg(dc: DataConnect, vars: CanManageWorkersForOrgVariables, options?: ExecuteQueryOptions): QueryPromise<CanManageWorkersForOrgData, CanManageWorkersForOrgVariables>;

interface CanManageWorkersForOrgRef {
  ...
  (dc: DataConnect, vars: CanManageWorkersForOrgVariables): QueryRef<CanManageWorkersForOrgData, CanManageWorkersForOrgVariables>;
}
export const canManageWorkersForOrgRef: CanManageWorkersForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the canManageWorkersForOrgRef:
```typescript
const name = canManageWorkersForOrgRef.operationName;
console.log(name);
```

### Variables
The `CanManageWorkersForOrg` query requires an argument of type `CanManageWorkersForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface CanManageWorkersForOrgVariables {
  orgId: string;
}
```
### Return Type
Recall that executing the `CanManageWorkersForOrg` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `CanManageWorkersForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface CanManageWorkersForOrgData {
  organizationMember?: {
    role: string;
  };
}
```
### Using `CanManageWorkersForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, canManageWorkersForOrg, CanManageWorkersForOrgVariables } from '@dataconnect/generated';

// The `CanManageWorkersForOrg` query requires an argument of type `CanManageWorkersForOrgVariables`:
const canManageWorkersForOrgVars: CanManageWorkersForOrgVariables = {
  orgId: ..., 
};

// Call the `canManageWorkersForOrg()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await canManageWorkersForOrg(canManageWorkersForOrgVars);
// Variables can be defined inline as well.
const { data } = await canManageWorkersForOrg({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await canManageWorkersForOrg(dataConnect, canManageWorkersForOrgVars);

console.log(data.organizationMember);

// Or, you can use the `Promise` API.
canManageWorkersForOrg(canManageWorkersForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.organizationMember);
});
```

### Using `CanManageWorkersForOrg`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, canManageWorkersForOrgRef, CanManageWorkersForOrgVariables } from '@dataconnect/generated';

// The `CanManageWorkersForOrg` query requires an argument of type `CanManageWorkersForOrgVariables`:
const canManageWorkersForOrgVars: CanManageWorkersForOrgVariables = {
  orgId: ..., 
};

// Call the `canManageWorkersForOrgRef()` function to get a reference to the query.
const ref = canManageWorkersForOrgRef(canManageWorkersForOrgVars);
// Variables can be defined inline as well.
const ref = canManageWorkersForOrgRef({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = canManageWorkersForOrgRef(dataConnect, canManageWorkersForOrgVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.organizationMember);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.organizationMember);
});
```

## WorkersForOrg
You can execute the `WorkersForOrg` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
workersForOrg(vars: WorkersForOrgVariables, options?: ExecuteQueryOptions): QueryPromise<WorkersForOrgData, WorkersForOrgVariables>;

interface WorkersForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: WorkersForOrgVariables): QueryRef<WorkersForOrgData, WorkersForOrgVariables>;
}
export const workersForOrgRef: WorkersForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
workersForOrg(dc: DataConnect, vars: WorkersForOrgVariables, options?: ExecuteQueryOptions): QueryPromise<WorkersForOrgData, WorkersForOrgVariables>;

interface WorkersForOrgRef {
  ...
  (dc: DataConnect, vars: WorkersForOrgVariables): QueryRef<WorkersForOrgData, WorkersForOrgVariables>;
}
export const workersForOrgRef: WorkersForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the workersForOrgRef:
```typescript
const name = workersForOrgRef.operationName;
console.log(name);
```

### Variables
The `WorkersForOrg` query requires an argument of type `WorkersForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface WorkersForOrgVariables {
  orgId: string;
}
```
### Return Type
Recall that executing the `WorkersForOrg` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `WorkersForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface WorkersForOrgData {
  workers: ({
    login: string;
    workerId?: string | null;
    workerName?: string | null;
    loginEmail?: string | null;
    authUid?: string | null;
    role?: string | null;
    active?: boolean | null;
    email?: string | null;
    phone?: string | null;
    workerType?: string | null;
    edit?: string | null;
    createdAt?: TimestampString | null;
    updatedAt?: TimestampString | null;
  })[];
}
```
### Using `WorkersForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, workersForOrg, WorkersForOrgVariables } from '@dataconnect/generated';

// The `WorkersForOrg` query requires an argument of type `WorkersForOrgVariables`:
const workersForOrgVars: WorkersForOrgVariables = {
  orgId: ..., 
};

// Call the `workersForOrg()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await workersForOrg(workersForOrgVars);
// Variables can be defined inline as well.
const { data } = await workersForOrg({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await workersForOrg(dataConnect, workersForOrgVars);

console.log(data.workers);

// Or, you can use the `Promise` API.
workersForOrg(workersForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.workers);
});
```

### Using `WorkersForOrg`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, workersForOrgRef, WorkersForOrgVariables } from '@dataconnect/generated';

// The `WorkersForOrg` query requires an argument of type `WorkersForOrgVariables`:
const workersForOrgVars: WorkersForOrgVariables = {
  orgId: ..., 
};

// Call the `workersForOrgRef()` function to get a reference to the query.
const ref = workersForOrgRef(workersForOrgVars);
// Variables can be defined inline as well.
const ref = workersForOrgRef({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = workersForOrgRef(dataConnect, workersForOrgVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.workers);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.workers);
});
```

## AdminWorkerCredentialForOrg
You can execute the `AdminWorkerCredentialForOrg` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
adminWorkerCredentialForOrg(vars: AdminWorkerCredentialForOrgVariables, options?: ExecuteQueryOptions): QueryPromise<AdminWorkerCredentialForOrgData, AdminWorkerCredentialForOrgVariables>;

interface AdminWorkerCredentialForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: AdminWorkerCredentialForOrgVariables): QueryRef<AdminWorkerCredentialForOrgData, AdminWorkerCredentialForOrgVariables>;
}
export const adminWorkerCredentialForOrgRef: AdminWorkerCredentialForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
adminWorkerCredentialForOrg(dc: DataConnect, vars: AdminWorkerCredentialForOrgVariables, options?: ExecuteQueryOptions): QueryPromise<AdminWorkerCredentialForOrgData, AdminWorkerCredentialForOrgVariables>;

interface AdminWorkerCredentialForOrgRef {
  ...
  (dc: DataConnect, vars: AdminWorkerCredentialForOrgVariables): QueryRef<AdminWorkerCredentialForOrgData, AdminWorkerCredentialForOrgVariables>;
}
export const adminWorkerCredentialForOrgRef: AdminWorkerCredentialForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the adminWorkerCredentialForOrgRef:
```typescript
const name = adminWorkerCredentialForOrgRef.operationName;
console.log(name);
```

### Variables
The `AdminWorkerCredentialForOrg` query requires an argument of type `AdminWorkerCredentialForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface AdminWorkerCredentialForOrgVariables {
  orgId: string;
  login: string;
}
```
### Return Type
Recall that executing the `AdminWorkerCredentialForOrg` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `AdminWorkerCredentialForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface AdminWorkerCredentialForOrgData {
  worker?: {
    login: string;
    workerName?: string | null;
    loginEmail?: string | null;
    email?: string | null;
    authUid?: string | null;
  };
    workerCredential?: {
      orgId: string;
      login: string;
      encryptedPassword: string;
      iv: string;
      authTag: string;
      algorithm: string;
      updatedAt: TimestampString;
      updatedBy?: string | null;
    } & WorkerCredential_Key;
}
```
### Using `AdminWorkerCredentialForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, adminWorkerCredentialForOrg, AdminWorkerCredentialForOrgVariables } from '@dataconnect/generated';

// The `AdminWorkerCredentialForOrg` query requires an argument of type `AdminWorkerCredentialForOrgVariables`:
const adminWorkerCredentialForOrgVars: AdminWorkerCredentialForOrgVariables = {
  orgId: ..., 
  login: ..., 
};

// Call the `adminWorkerCredentialForOrg()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await adminWorkerCredentialForOrg(adminWorkerCredentialForOrgVars);
// Variables can be defined inline as well.
const { data } = await adminWorkerCredentialForOrg({ orgId: ..., login: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await adminWorkerCredentialForOrg(dataConnect, adminWorkerCredentialForOrgVars);

console.log(data.worker);
console.log(data.workerCredential);

// Or, you can use the `Promise` API.
adminWorkerCredentialForOrg(adminWorkerCredentialForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.worker);
  console.log(data.workerCredential);
});
```

### Using `AdminWorkerCredentialForOrg`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, adminWorkerCredentialForOrgRef, AdminWorkerCredentialForOrgVariables } from '@dataconnect/generated';

// The `AdminWorkerCredentialForOrg` query requires an argument of type `AdminWorkerCredentialForOrgVariables`:
const adminWorkerCredentialForOrgVars: AdminWorkerCredentialForOrgVariables = {
  orgId: ..., 
  login: ..., 
};

// Call the `adminWorkerCredentialForOrgRef()` function to get a reference to the query.
const ref = adminWorkerCredentialForOrgRef(adminWorkerCredentialForOrgVars);
// Variables can be defined inline as well.
const ref = adminWorkerCredentialForOrgRef({ orgId: ..., login: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = adminWorkerCredentialForOrgRef(dataConnect, adminWorkerCredentialForOrgVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.worker);
console.log(data.workerCredential);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.worker);
  console.log(data.workerCredential);
});
```

## ClientsForOrg
You can execute the `ClientsForOrg` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
clientsForOrg(vars: ClientsForOrgVariables, options?: ExecuteQueryOptions): QueryPromise<ClientsForOrgData, ClientsForOrgVariables>;

interface ClientsForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: ClientsForOrgVariables): QueryRef<ClientsForOrgData, ClientsForOrgVariables>;
}
export const clientsForOrgRef: ClientsForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
clientsForOrg(dc: DataConnect, vars: ClientsForOrgVariables, options?: ExecuteQueryOptions): QueryPromise<ClientsForOrgData, ClientsForOrgVariables>;

interface ClientsForOrgRef {
  ...
  (dc: DataConnect, vars: ClientsForOrgVariables): QueryRef<ClientsForOrgData, ClientsForOrgVariables>;
}
export const clientsForOrgRef: ClientsForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the clientsForOrgRef:
```typescript
const name = clientsForOrgRef.operationName;
console.log(name);
```

### Variables
The `ClientsForOrg` query requires an argument of type `ClientsForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface ClientsForOrgVariables {
  orgId: string;
}
```
### Return Type
Recall that executing the `ClientsForOrg` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `ClientsForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface ClientsForOrgData {
  clients: ({
    clientId: string;
    name?: string | null;
    nip?: string | null;
    city?: string | null;
    address?: string | null;
    contact?: string | null;
    coordinator?: string | null;
    status?: string | null;
    serviceFrequency?: string | null;
    assignees?: string | null;
    chemistry?: string | null;
    equipment?: string | null;
    clientInfo?: string | null;
  })[];
}
```
### Using `ClientsForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, clientsForOrg, ClientsForOrgVariables } from '@dataconnect/generated';

// The `ClientsForOrg` query requires an argument of type `ClientsForOrgVariables`:
const clientsForOrgVars: ClientsForOrgVariables = {
  orgId: ..., 
};

// Call the `clientsForOrg()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await clientsForOrg(clientsForOrgVars);
// Variables can be defined inline as well.
const { data } = await clientsForOrg({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await clientsForOrg(dataConnect, clientsForOrgVars);

console.log(data.clients);

// Or, you can use the `Promise` API.
clientsForOrg(clientsForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.clients);
});
```

### Using `ClientsForOrg`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, clientsForOrgRef, ClientsForOrgVariables } from '@dataconnect/generated';

// The `ClientsForOrg` query requires an argument of type `ClientsForOrgVariables`:
const clientsForOrgVars: ClientsForOrgVariables = {
  orgId: ..., 
};

// Call the `clientsForOrgRef()` function to get a reference to the query.
const ref = clientsForOrgRef(clientsForOrgVars);
// Variables can be defined inline as well.
const ref = clientsForOrgRef({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = clientsForOrgRef(dataConnect, clientsForOrgVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.clients);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.clients);
});
```

## IndividualJobsForOrg
You can execute the `IndividualJobsForOrg` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
individualJobsForOrg(vars: IndividualJobsForOrgVariables, options?: ExecuteQueryOptions): QueryPromise<IndividualJobsForOrgData, IndividualJobsForOrgVariables>;

interface IndividualJobsForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: IndividualJobsForOrgVariables): QueryRef<IndividualJobsForOrgData, IndividualJobsForOrgVariables>;
}
export const individualJobsForOrgRef: IndividualJobsForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
individualJobsForOrg(dc: DataConnect, vars: IndividualJobsForOrgVariables, options?: ExecuteQueryOptions): QueryPromise<IndividualJobsForOrgData, IndividualJobsForOrgVariables>;

interface IndividualJobsForOrgRef {
  ...
  (dc: DataConnect, vars: IndividualJobsForOrgVariables): QueryRef<IndividualJobsForOrgData, IndividualJobsForOrgVariables>;
}
export const individualJobsForOrgRef: IndividualJobsForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the individualJobsForOrgRef:
```typescript
const name = individualJobsForOrgRef.operationName;
console.log(name);
```

### Variables
The `IndividualJobsForOrg` query requires an argument of type `IndividualJobsForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface IndividualJobsForOrgVariables {
  orgId: string;
}
```
### Return Type
Recall that executing the `IndividualJobsForOrg` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `IndividualJobsForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface IndividualJobsForOrgData {
  individualClientJobs: ({
    clientIndId: string;
    date?: TimestampString | null;
    name?: string | null;
    nip?: string | null;
    city?: string | null;
    address?: string | null;
    contact?: string | null;
    clientInfo?: string | null;
    qrCode?: string | null;
  })[];
}
```
### Using `IndividualJobsForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, individualJobsForOrg, IndividualJobsForOrgVariables } from '@dataconnect/generated';

// The `IndividualJobsForOrg` query requires an argument of type `IndividualJobsForOrgVariables`:
const individualJobsForOrgVars: IndividualJobsForOrgVariables = {
  orgId: ..., 
};

// Call the `individualJobsForOrg()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await individualJobsForOrg(individualJobsForOrgVars);
// Variables can be defined inline as well.
const { data } = await individualJobsForOrg({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await individualJobsForOrg(dataConnect, individualJobsForOrgVars);

console.log(data.individualClientJobs);

// Or, you can use the `Promise` API.
individualJobsForOrg(individualJobsForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.individualClientJobs);
});
```

### Using `IndividualJobsForOrg`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, individualJobsForOrgRef, IndividualJobsForOrgVariables } from '@dataconnect/generated';

// The `IndividualJobsForOrg` query requires an argument of type `IndividualJobsForOrgVariables`:
const individualJobsForOrgVars: IndividualJobsForOrgVariables = {
  orgId: ..., 
};

// Call the `individualJobsForOrgRef()` function to get a reference to the query.
const ref = individualJobsForOrgRef(individualJobsForOrgVars);
// Variables can be defined inline as well.
const ref = individualJobsForOrgRef({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = individualJobsForOrgRef(dataConnect, individualJobsForOrgVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.individualClientJobs);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.individualClientJobs);
});
```

## ZonesForOrg
You can execute the `ZonesForOrg` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
zonesForOrg(vars: ZonesForOrgVariables, options?: ExecuteQueryOptions): QueryPromise<ZonesForOrgData, ZonesForOrgVariables>;

interface ZonesForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: ZonesForOrgVariables): QueryRef<ZonesForOrgData, ZonesForOrgVariables>;
}
export const zonesForOrgRef: ZonesForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
zonesForOrg(dc: DataConnect, vars: ZonesForOrgVariables, options?: ExecuteQueryOptions): QueryPromise<ZonesForOrgData, ZonesForOrgVariables>;

interface ZonesForOrgRef {
  ...
  (dc: DataConnect, vars: ZonesForOrgVariables): QueryRef<ZonesForOrgData, ZonesForOrgVariables>;
}
export const zonesForOrgRef: ZonesForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the zonesForOrgRef:
```typescript
const name = zonesForOrgRef.operationName;
console.log(name);
```

### Variables
The `ZonesForOrg` query requires an argument of type `ZonesForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface ZonesForOrgVariables {
  orgId: string;
}
```
### Return Type
Recall that executing the `ZonesForOrg` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `ZonesForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface ZonesForOrgData {
  zones: ({
    zoneId: string;
    clientId: string;
    zone?: string | null;
    function?: string | null;
    editedBy?: string | null;
    date?: TimestampString | null;
    location?: string | null;
  })[];
}
```
### Using `ZonesForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, zonesForOrg, ZonesForOrgVariables } from '@dataconnect/generated';

// The `ZonesForOrg` query requires an argument of type `ZonesForOrgVariables`:
const zonesForOrgVars: ZonesForOrgVariables = {
  orgId: ..., 
};

// Call the `zonesForOrg()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await zonesForOrg(zonesForOrgVars);
// Variables can be defined inline as well.
const { data } = await zonesForOrg({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await zonesForOrg(dataConnect, zonesForOrgVars);

console.log(data.zones);

// Or, you can use the `Promise` API.
zonesForOrg(zonesForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.zones);
});
```

### Using `ZonesForOrg`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, zonesForOrgRef, ZonesForOrgVariables } from '@dataconnect/generated';

// The `ZonesForOrg` query requires an argument of type `ZonesForOrgVariables`:
const zonesForOrgVars: ZonesForOrgVariables = {
  orgId: ..., 
};

// Call the `zonesForOrgRef()` function to get a reference to the query.
const ref = zonesForOrgRef(zonesForOrgVars);
// Variables can be defined inline as well.
const ref = zonesForOrgRef({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = zonesForOrgRef(dataConnect, zonesForOrgVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.zones);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.zones);
});
```

## WorkdaysForOrg
You can execute the `WorkdaysForOrg` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
workdaysForOrg(vars: WorkdaysForOrgVariables, options?: ExecuteQueryOptions): QueryPromise<WorkdaysForOrgData, WorkdaysForOrgVariables>;

interface WorkdaysForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: WorkdaysForOrgVariables): QueryRef<WorkdaysForOrgData, WorkdaysForOrgVariables>;
}
export const workdaysForOrgRef: WorkdaysForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
workdaysForOrg(dc: DataConnect, vars: WorkdaysForOrgVariables, options?: ExecuteQueryOptions): QueryPromise<WorkdaysForOrgData, WorkdaysForOrgVariables>;

interface WorkdaysForOrgRef {
  ...
  (dc: DataConnect, vars: WorkdaysForOrgVariables): QueryRef<WorkdaysForOrgData, WorkdaysForOrgVariables>;
}
export const workdaysForOrgRef: WorkdaysForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the workdaysForOrgRef:
```typescript
const name = workdaysForOrgRef.operationName;
console.log(name);
```

### Variables
The `WorkdaysForOrg` query requires an argument of type `WorkdaysForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface WorkdaysForOrgVariables {
  orgId: string;
}
```
### Return Type
Recall that executing the `WorkdaysForOrg` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `WorkdaysForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface WorkdaysForOrgData {
  workdays: ({
    workdayId: string;
    workerLogin: string;
    workerName?: string | null;
    utilityRoomId?: string | null;
    startAt?: TimestampString | null;
    endScanAt?: TimestampString | null;
    autoCloseAt?: TimestampString | null;
    endAt?: TimestampString | null;
    durationSec?: number | null;
    status?: string | null;
    deviceId?: string | null;
    gps?: string | null;
    startEventId?: string | null;
    endEventId?: string | null;
    startObject?: string | null;
    stopObject?: string | null;
    comment?: string | null;
    updatedBy?: string | null;
    updatedAt?: TimestampString | null;
  })[];
}
```
### Using `WorkdaysForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, workdaysForOrg, WorkdaysForOrgVariables } from '@dataconnect/generated';

// The `WorkdaysForOrg` query requires an argument of type `WorkdaysForOrgVariables`:
const workdaysForOrgVars: WorkdaysForOrgVariables = {
  orgId: ..., 
};

// Call the `workdaysForOrg()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await workdaysForOrg(workdaysForOrgVars);
// Variables can be defined inline as well.
const { data } = await workdaysForOrg({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await workdaysForOrg(dataConnect, workdaysForOrgVars);

console.log(data.workdays);

// Or, you can use the `Promise` API.
workdaysForOrg(workdaysForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.workdays);
});
```

### Using `WorkdaysForOrg`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, workdaysForOrgRef, WorkdaysForOrgVariables } from '@dataconnect/generated';

// The `WorkdaysForOrg` query requires an argument of type `WorkdaysForOrgVariables`:
const workdaysForOrgVars: WorkdaysForOrgVariables = {
  orgId: ..., 
};

// Call the `workdaysForOrgRef()` function to get a reference to the query.
const ref = workdaysForOrgRef(workdaysForOrgVars);
// Variables can be defined inline as well.
const ref = workdaysForOrgRef({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = workdaysForOrgRef(dataConnect, workdaysForOrgVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.workdays);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.workdays);
});
```

## BackupCyclesForOrg
You can execute the `BackupCyclesForOrg` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
backupCyclesForOrg(vars: BackupCyclesForOrgVariables, options?: ExecuteQueryOptions): QueryPromise<BackupCyclesForOrgData, BackupCyclesForOrgVariables>;

interface BackupCyclesForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: BackupCyclesForOrgVariables): QueryRef<BackupCyclesForOrgData, BackupCyclesForOrgVariables>;
}
export const backupCyclesForOrgRef: BackupCyclesForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
backupCyclesForOrg(dc: DataConnect, vars: BackupCyclesForOrgVariables, options?: ExecuteQueryOptions): QueryPromise<BackupCyclesForOrgData, BackupCyclesForOrgVariables>;

interface BackupCyclesForOrgRef {
  ...
  (dc: DataConnect, vars: BackupCyclesForOrgVariables): QueryRef<BackupCyclesForOrgData, BackupCyclesForOrgVariables>;
}
export const backupCyclesForOrgRef: BackupCyclesForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the backupCyclesForOrgRef:
```typescript
const name = backupCyclesForOrgRef.operationName;
console.log(name);
```

### Variables
The `BackupCyclesForOrg` query requires an argument of type `BackupCyclesForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface BackupCyclesForOrgVariables {
  orgId: string;
}
```
### Return Type
Recall that executing the `BackupCyclesForOrg` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `BackupCyclesForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface BackupCyclesForOrgData {
  backupCycles: ({
    workdayId: string;
    workerLogin?: string | null;
    workerName?: string | null;
    utilityRoomId?: string | null;
    strefa?: string | null;
    pomieszczenie?: string | null;
    startAt?: TimestampString | null;
    endAt?: TimestampString | null;
    durationSec?: number | null;
    status?: string | null;
    comment?: string | null;
    updatedAt?: TimestampString | null;
  })[];
}
```
### Using `BackupCyclesForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, backupCyclesForOrg, BackupCyclesForOrgVariables } from '@dataconnect/generated';

// The `BackupCyclesForOrg` query requires an argument of type `BackupCyclesForOrgVariables`:
const backupCyclesForOrgVars: BackupCyclesForOrgVariables = {
  orgId: ..., 
};

// Call the `backupCyclesForOrg()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await backupCyclesForOrg(backupCyclesForOrgVars);
// Variables can be defined inline as well.
const { data } = await backupCyclesForOrg({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await backupCyclesForOrg(dataConnect, backupCyclesForOrgVars);

console.log(data.backupCycles);

// Or, you can use the `Promise` API.
backupCyclesForOrg(backupCyclesForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.backupCycles);
});
```

### Using `BackupCyclesForOrg`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, backupCyclesForOrgRef, BackupCyclesForOrgVariables } from '@dataconnect/generated';

// The `BackupCyclesForOrg` query requires an argument of type `BackupCyclesForOrgVariables`:
const backupCyclesForOrgVars: BackupCyclesForOrgVariables = {
  orgId: ..., 
};

// Call the `backupCyclesForOrgRef()` function to get a reference to the query.
const ref = backupCyclesForOrgRef(backupCyclesForOrgVars);
// Variables can be defined inline as well.
const ref = backupCyclesForOrgRef({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = backupCyclesForOrgRef(dataConnect, backupCyclesForOrgVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.backupCycles);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.backupCycles);
});
```

## EventsForOrg
You can execute the `EventsForOrg` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
eventsForOrg(vars: EventsForOrgVariables, options?: ExecuteQueryOptions): QueryPromise<EventsForOrgData, EventsForOrgVariables>;

interface EventsForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: EventsForOrgVariables): QueryRef<EventsForOrgData, EventsForOrgVariables>;
}
export const eventsForOrgRef: EventsForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
eventsForOrg(dc: DataConnect, vars: EventsForOrgVariables, options?: ExecuteQueryOptions): QueryPromise<EventsForOrgData, EventsForOrgVariables>;

interface EventsForOrgRef {
  ...
  (dc: DataConnect, vars: EventsForOrgVariables): QueryRef<EventsForOrgData, EventsForOrgVariables>;
}
export const eventsForOrgRef: EventsForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the eventsForOrgRef:
```typescript
const name = eventsForOrgRef.operationName;
console.log(name);
```

### Variables
The `EventsForOrg` query requires an argument of type `EventsForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface EventsForOrgVariables {
  orgId: string;
}
```
### Return Type
Recall that executing the `EventsForOrg` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `EventsForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface EventsForOrgData {
  events: ({
    eventId: string;
    workdayId?: string | null;
    zoneId?: string | null;
    workerLogin?: string | null;
    workerName?: string | null;
    startAt?: TimestampString | null;
    endAt?: TimestampString | null;
    durationSec?: number | null;
    status?: string | null;
    closeMarkedAt?: TimestampString | null;
    endReason?: string | null;
    comment?: string | null;
    deviceId?: string | null;
    startEventId?: string | null;
    endEventId?: string | null;
    createdAt?: TimestampString | null;
    updatedAt?: TimestampString | null;
    zone?: {
      zoneId: string;
      zone?: string | null;
      function?: string | null;
      location?: string | null;
      client: {
        clientId: string;
        name?: string | null;
      };
    };
  })[];
}
```
### Using `EventsForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, eventsForOrg, EventsForOrgVariables } from '@dataconnect/generated';

// The `EventsForOrg` query requires an argument of type `EventsForOrgVariables`:
const eventsForOrgVars: EventsForOrgVariables = {
  orgId: ..., 
};

// Call the `eventsForOrg()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await eventsForOrg(eventsForOrgVars);
// Variables can be defined inline as well.
const { data } = await eventsForOrg({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await eventsForOrg(dataConnect, eventsForOrgVars);

console.log(data.events);

// Or, you can use the `Promise` API.
eventsForOrg(eventsForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.events);
});
```

### Using `EventsForOrg`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, eventsForOrgRef, EventsForOrgVariables } from '@dataconnect/generated';

// The `EventsForOrg` query requires an argument of type `EventsForOrgVariables`:
const eventsForOrgVars: EventsForOrgVariables = {
  orgId: ..., 
};

// Call the `eventsForOrgRef()` function to get a reference to the query.
const ref = eventsForOrgRef(eventsForOrgVars);
// Variables can be defined inline as well.
const ref = eventsForOrgRef({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = eventsForOrgRef(dataConnect, eventsForOrgVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.events);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.events);
});
```

## WorkerWorkdaysForOrg
You can execute the `WorkerWorkdaysForOrg` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
workerWorkdaysForOrg(vars: WorkerWorkdaysForOrgVariables, options?: ExecuteQueryOptions): QueryPromise<WorkerWorkdaysForOrgData, WorkerWorkdaysForOrgVariables>;

interface WorkerWorkdaysForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: WorkerWorkdaysForOrgVariables): QueryRef<WorkerWorkdaysForOrgData, WorkerWorkdaysForOrgVariables>;
}
export const workerWorkdaysForOrgRef: WorkerWorkdaysForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
workerWorkdaysForOrg(dc: DataConnect, vars: WorkerWorkdaysForOrgVariables, options?: ExecuteQueryOptions): QueryPromise<WorkerWorkdaysForOrgData, WorkerWorkdaysForOrgVariables>;

interface WorkerWorkdaysForOrgRef {
  ...
  (dc: DataConnect, vars: WorkerWorkdaysForOrgVariables): QueryRef<WorkerWorkdaysForOrgData, WorkerWorkdaysForOrgVariables>;
}
export const workerWorkdaysForOrgRef: WorkerWorkdaysForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the workerWorkdaysForOrgRef:
```typescript
const name = workerWorkdaysForOrgRef.operationName;
console.log(name);
```

### Variables
The `WorkerWorkdaysForOrg` query requires an argument of type `WorkerWorkdaysForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface WorkerWorkdaysForOrgVariables {
  orgId: string;
  workerLogin: string;
}
```
### Return Type
Recall that executing the `WorkerWorkdaysForOrg` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `WorkerWorkdaysForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface WorkerWorkdaysForOrgData {
  workdays: ({
    workdayId: string;
    workerLogin: string;
    workerName?: string | null;
    utilityRoomId?: string | null;
    startAt?: TimestampString | null;
    endScanAt?: TimestampString | null;
    autoCloseAt?: TimestampString | null;
    endAt?: TimestampString | null;
    durationSec?: number | null;
    status?: string | null;
    deviceId?: string | null;
    gps?: string | null;
    startEventId?: string | null;
    endEventId?: string | null;
    startObject?: string | null;
    stopObject?: string | null;
    comment?: string | null;
    updatedBy?: string | null;
    updatedAt?: TimestampString | null;
  })[];
}
```
### Using `WorkerWorkdaysForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, workerWorkdaysForOrg, WorkerWorkdaysForOrgVariables } from '@dataconnect/generated';

// The `WorkerWorkdaysForOrg` query requires an argument of type `WorkerWorkdaysForOrgVariables`:
const workerWorkdaysForOrgVars: WorkerWorkdaysForOrgVariables = {
  orgId: ..., 
  workerLogin: ..., 
};

// Call the `workerWorkdaysForOrg()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await workerWorkdaysForOrg(workerWorkdaysForOrgVars);
// Variables can be defined inline as well.
const { data } = await workerWorkdaysForOrg({ orgId: ..., workerLogin: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await workerWorkdaysForOrg(dataConnect, workerWorkdaysForOrgVars);

console.log(data.workdays);

// Or, you can use the `Promise` API.
workerWorkdaysForOrg(workerWorkdaysForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.workdays);
});
```

### Using `WorkerWorkdaysForOrg`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, workerWorkdaysForOrgRef, WorkerWorkdaysForOrgVariables } from '@dataconnect/generated';

// The `WorkerWorkdaysForOrg` query requires an argument of type `WorkerWorkdaysForOrgVariables`:
const workerWorkdaysForOrgVars: WorkerWorkdaysForOrgVariables = {
  orgId: ..., 
  workerLogin: ..., 
};

// Call the `workerWorkdaysForOrgRef()` function to get a reference to the query.
const ref = workerWorkdaysForOrgRef(workerWorkdaysForOrgVars);
// Variables can be defined inline as well.
const ref = workerWorkdaysForOrgRef({ orgId: ..., workerLogin: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = workerWorkdaysForOrgRef(dataConnect, workerWorkdaysForOrgVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.workdays);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.workdays);
});
```

## StorageForOrg
You can execute the `StorageForOrg` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
storageForOrg(vars: StorageForOrgVariables, options?: ExecuteQueryOptions): QueryPromise<StorageForOrgData, StorageForOrgVariables>;

interface StorageForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: StorageForOrgVariables): QueryRef<StorageForOrgData, StorageForOrgVariables>;
}
export const storageForOrgRef: StorageForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
storageForOrg(dc: DataConnect, vars: StorageForOrgVariables, options?: ExecuteQueryOptions): QueryPromise<StorageForOrgData, StorageForOrgVariables>;

interface StorageForOrgRef {
  ...
  (dc: DataConnect, vars: StorageForOrgVariables): QueryRef<StorageForOrgData, StorageForOrgVariables>;
}
export const storageForOrgRef: StorageForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the storageForOrgRef:
```typescript
const name = storageForOrgRef.operationName;
console.log(name);
```

### Variables
The `StorageForOrg` query requires an argument of type `StorageForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface StorageForOrgVariables {
  orgId: string;
  limit?: number | null;
  offset?: number | null;
}
```
### Return Type
Recall that executing the `StorageForOrg` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `StorageForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface StorageForOrgData {
  storages: ({
    orgId: string;
    productIndex: string;
    productId: string;
    name: string;
    productType: string;
    quantity: number;
    quantityMin: number;
    quantityMax?: number | null;
    description?: string | null;
    qrCode?: string | null;
  } & Storage_Key)[];
}
```
### Using `StorageForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, storageForOrg, StorageForOrgVariables } from '@dataconnect/generated';

// The `StorageForOrg` query requires an argument of type `StorageForOrgVariables`:
const storageForOrgVars: StorageForOrgVariables = {
  orgId: ..., 
  limit: ..., // optional
  offset: ..., // optional
};

// Call the `storageForOrg()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await storageForOrg(storageForOrgVars);
// Variables can be defined inline as well.
const { data } = await storageForOrg({ orgId: ..., limit: ..., offset: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await storageForOrg(dataConnect, storageForOrgVars);

console.log(data.storages);

// Or, you can use the `Promise` API.
storageForOrg(storageForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.storages);
});
```

### Using `StorageForOrg`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, storageForOrgRef, StorageForOrgVariables } from '@dataconnect/generated';

// The `StorageForOrg` query requires an argument of type `StorageForOrgVariables`:
const storageForOrgVars: StorageForOrgVariables = {
  orgId: ..., 
  limit: ..., // optional
  offset: ..., // optional
};

// Call the `storageForOrgRef()` function to get a reference to the query.
const ref = storageForOrgRef(storageForOrgVars);
// Variables can be defined inline as well.
const ref = storageForOrgRef({ orgId: ..., limit: ..., offset: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = storageForOrgRef(dataConnect, storageForOrgVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.storages);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.storages);
});
```

## ClientStorageForClient
You can execute the `ClientStorageForClient` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
clientStorageForClient(vars: ClientStorageForClientVariables, options?: ExecuteQueryOptions): QueryPromise<ClientStorageForClientData, ClientStorageForClientVariables>;

interface ClientStorageForClientRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: ClientStorageForClientVariables): QueryRef<ClientStorageForClientData, ClientStorageForClientVariables>;
}
export const clientStorageForClientRef: ClientStorageForClientRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
clientStorageForClient(dc: DataConnect, vars: ClientStorageForClientVariables, options?: ExecuteQueryOptions): QueryPromise<ClientStorageForClientData, ClientStorageForClientVariables>;

interface ClientStorageForClientRef {
  ...
  (dc: DataConnect, vars: ClientStorageForClientVariables): QueryRef<ClientStorageForClientData, ClientStorageForClientVariables>;
}
export const clientStorageForClientRef: ClientStorageForClientRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the clientStorageForClientRef:
```typescript
const name = clientStorageForClientRef.operationName;
console.log(name);
```

### Variables
The `ClientStorageForClient` query requires an argument of type `ClientStorageForClientVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface ClientStorageForClientVariables {
  orgId: string;
  clientId: string;
  limit?: number | null;
  offset?: number | null;
}
```
### Return Type
Recall that executing the `ClientStorageForClient` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `ClientStorageForClientData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface ClientStorageForClientData {
  clientStorages: ({
    orgId: string;
    clientId: string;
    productIndex: string;
    name: string;
    productType: string;
    quantity: number;
    quantityMin: number;
    quantityMax?: number | null;
    qrCode?: string | null;
    storage: {
      productId: string;
      quantity: number;
      quantityMin: number;
      quantityMax?: number | null;
    };
      client: {
        name?: string | null;
        status?: string | null;
      };
  } & ClientStorage_Key)[];
}
```
### Using `ClientStorageForClient`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, clientStorageForClient, ClientStorageForClientVariables } from '@dataconnect/generated';

// The `ClientStorageForClient` query requires an argument of type `ClientStorageForClientVariables`:
const clientStorageForClientVars: ClientStorageForClientVariables = {
  orgId: ..., 
  clientId: ..., 
  limit: ..., // optional
  offset: ..., // optional
};

// Call the `clientStorageForClient()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await clientStorageForClient(clientStorageForClientVars);
// Variables can be defined inline as well.
const { data } = await clientStorageForClient({ orgId: ..., clientId: ..., limit: ..., offset: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await clientStorageForClient(dataConnect, clientStorageForClientVars);

console.log(data.clientStorages);

// Or, you can use the `Promise` API.
clientStorageForClient(clientStorageForClientVars).then((response) => {
  const data = response.data;
  console.log(data.clientStorages);
});
```

### Using `ClientStorageForClient`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, clientStorageForClientRef, ClientStorageForClientVariables } from '@dataconnect/generated';

// The `ClientStorageForClient` query requires an argument of type `ClientStorageForClientVariables`:
const clientStorageForClientVars: ClientStorageForClientVariables = {
  orgId: ..., 
  clientId: ..., 
  limit: ..., // optional
  offset: ..., // optional
};

// Call the `clientStorageForClientRef()` function to get a reference to the query.
const ref = clientStorageForClientRef(clientStorageForClientVars);
// Variables can be defined inline as well.
const ref = clientStorageForClientRef({ orgId: ..., clientId: ..., limit: ..., offset: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = clientStorageForClientRef(dataConnect, clientStorageForClientVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.clientStorages);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.clientStorages);
});
```

## ClientStorageForOrg
You can execute the `ClientStorageForOrg` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
clientStorageForOrg(vars: ClientStorageForOrgVariables, options?: ExecuteQueryOptions): QueryPromise<ClientStorageForOrgData, ClientStorageForOrgVariables>;

interface ClientStorageForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: ClientStorageForOrgVariables): QueryRef<ClientStorageForOrgData, ClientStorageForOrgVariables>;
}
export const clientStorageForOrgRef: ClientStorageForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
clientStorageForOrg(dc: DataConnect, vars: ClientStorageForOrgVariables, options?: ExecuteQueryOptions): QueryPromise<ClientStorageForOrgData, ClientStorageForOrgVariables>;

interface ClientStorageForOrgRef {
  ...
  (dc: DataConnect, vars: ClientStorageForOrgVariables): QueryRef<ClientStorageForOrgData, ClientStorageForOrgVariables>;
}
export const clientStorageForOrgRef: ClientStorageForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the clientStorageForOrgRef:
```typescript
const name = clientStorageForOrgRef.operationName;
console.log(name);
```

### Variables
The `ClientStorageForOrg` query requires an argument of type `ClientStorageForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface ClientStorageForOrgVariables {
  orgId: string;
  limit?: number | null;
  offset?: number | null;
}
```
### Return Type
Recall that executing the `ClientStorageForOrg` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `ClientStorageForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface ClientStorageForOrgData {
  clientStorages: ({
    orgId: string;
    clientId: string;
    productIndex: string;
    name: string;
    productType: string;
    quantity: number;
    quantityMin: number;
    quantityMax?: number | null;
    qrCode?: string | null;
  } & ClientStorage_Key)[];
}
```
### Using `ClientStorageForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, clientStorageForOrg, ClientStorageForOrgVariables } from '@dataconnect/generated';

// The `ClientStorageForOrg` query requires an argument of type `ClientStorageForOrgVariables`:
const clientStorageForOrgVars: ClientStorageForOrgVariables = {
  orgId: ..., 
  limit: ..., // optional
  offset: ..., // optional
};

// Call the `clientStorageForOrg()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await clientStorageForOrg(clientStorageForOrgVars);
// Variables can be defined inline as well.
const { data } = await clientStorageForOrg({ orgId: ..., limit: ..., offset: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await clientStorageForOrg(dataConnect, clientStorageForOrgVars);

console.log(data.clientStorages);

// Or, you can use the `Promise` API.
clientStorageForOrg(clientStorageForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.clientStorages);
});
```

### Using `ClientStorageForOrg`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, clientStorageForOrgRef, ClientStorageForOrgVariables } from '@dataconnect/generated';

// The `ClientStorageForOrg` query requires an argument of type `ClientStorageForOrgVariables`:
const clientStorageForOrgVars: ClientStorageForOrgVariables = {
  orgId: ..., 
  limit: ..., // optional
  offset: ..., // optional
};

// Call the `clientStorageForOrgRef()` function to get a reference to the query.
const ref = clientStorageForOrgRef(clientStorageForOrgVars);
// Variables can be defined inline as well.
const ref = clientStorageForOrgRef({ orgId: ..., limit: ..., offset: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = clientStorageForOrgRef(dataConnect, clientStorageForOrgVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.clientStorages);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.clientStorages);
});
```

## WorkdayPausesForOrg
You can execute the `WorkdayPausesForOrg` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
workdayPausesForOrg(vars: WorkdayPausesForOrgVariables, options?: ExecuteQueryOptions): QueryPromise<WorkdayPausesForOrgData, WorkdayPausesForOrgVariables>;

interface WorkdayPausesForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: WorkdayPausesForOrgVariables): QueryRef<WorkdayPausesForOrgData, WorkdayPausesForOrgVariables>;
}
export const workdayPausesForOrgRef: WorkdayPausesForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
workdayPausesForOrg(dc: DataConnect, vars: WorkdayPausesForOrgVariables, options?: ExecuteQueryOptions): QueryPromise<WorkdayPausesForOrgData, WorkdayPausesForOrgVariables>;

interface WorkdayPausesForOrgRef {
  ...
  (dc: DataConnect, vars: WorkdayPausesForOrgVariables): QueryRef<WorkdayPausesForOrgData, WorkdayPausesForOrgVariables>;
}
export const workdayPausesForOrgRef: WorkdayPausesForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the workdayPausesForOrgRef:
```typescript
const name = workdayPausesForOrgRef.operationName;
console.log(name);
```

### Variables
The `WorkdayPausesForOrg` query requires an argument of type `WorkdayPausesForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface WorkdayPausesForOrgVariables {
  orgId: string;
}
```
### Return Type
Recall that executing the `WorkdayPausesForOrg` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `WorkdayPausesForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface WorkdayPausesForOrgData {
  workdayPauses: ({
    pauseId: string;
    workdayId: string;
    workerLogin?: string | null;
    workerName?: string | null;
    deviceId?: string | null;
    pauseEventId?: string | null;
    startAt?: TimestampString | null;
    stopAt?: TimestampString | null;
    durationSec?: number | null;
    status?: string | null;
    createdAt?: TimestampString | null;
    updatedAt?: TimestampString | null;
  })[];
}
```
### Using `WorkdayPausesForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, workdayPausesForOrg, WorkdayPausesForOrgVariables } from '@dataconnect/generated';

// The `WorkdayPausesForOrg` query requires an argument of type `WorkdayPausesForOrgVariables`:
const workdayPausesForOrgVars: WorkdayPausesForOrgVariables = {
  orgId: ..., 
};

// Call the `workdayPausesForOrg()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await workdayPausesForOrg(workdayPausesForOrgVars);
// Variables can be defined inline as well.
const { data } = await workdayPausesForOrg({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await workdayPausesForOrg(dataConnect, workdayPausesForOrgVars);

console.log(data.workdayPauses);

// Or, you can use the `Promise` API.
workdayPausesForOrg(workdayPausesForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.workdayPauses);
});
```

### Using `WorkdayPausesForOrg`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, workdayPausesForOrgRef, WorkdayPausesForOrgVariables } from '@dataconnect/generated';

// The `WorkdayPausesForOrg` query requires an argument of type `WorkdayPausesForOrgVariables`:
const workdayPausesForOrgVars: WorkdayPausesForOrgVariables = {
  orgId: ..., 
};

// Call the `workdayPausesForOrgRef()` function to get a reference to the query.
const ref = workdayPausesForOrgRef(workdayPausesForOrgVars);
// Variables can be defined inline as well.
const ref = workdayPausesForOrgRef({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = workdayPausesForOrgRef(dataConnect, workdayPausesForOrgVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.workdayPauses);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.workdayPauses);
});
```

## ActiveWorkdayPauseForWorker
You can execute the `ActiveWorkdayPauseForWorker` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
activeWorkdayPauseForWorker(vars: ActiveWorkdayPauseForWorkerVariables, options?: ExecuteQueryOptions): QueryPromise<ActiveWorkdayPauseForWorkerData, ActiveWorkdayPauseForWorkerVariables>;

interface ActiveWorkdayPauseForWorkerRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: ActiveWorkdayPauseForWorkerVariables): QueryRef<ActiveWorkdayPauseForWorkerData, ActiveWorkdayPauseForWorkerVariables>;
}
export const activeWorkdayPauseForWorkerRef: ActiveWorkdayPauseForWorkerRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
activeWorkdayPauseForWorker(dc: DataConnect, vars: ActiveWorkdayPauseForWorkerVariables, options?: ExecuteQueryOptions): QueryPromise<ActiveWorkdayPauseForWorkerData, ActiveWorkdayPauseForWorkerVariables>;

interface ActiveWorkdayPauseForWorkerRef {
  ...
  (dc: DataConnect, vars: ActiveWorkdayPauseForWorkerVariables): QueryRef<ActiveWorkdayPauseForWorkerData, ActiveWorkdayPauseForWorkerVariables>;
}
export const activeWorkdayPauseForWorkerRef: ActiveWorkdayPauseForWorkerRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the activeWorkdayPauseForWorkerRef:
```typescript
const name = activeWorkdayPauseForWorkerRef.operationName;
console.log(name);
```

### Variables
The `ActiveWorkdayPauseForWorker` query requires an argument of type `ActiveWorkdayPauseForWorkerVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface ActiveWorkdayPauseForWorkerVariables {
  orgId: string;
  workerLogin: string;
}
```
### Return Type
Recall that executing the `ActiveWorkdayPauseForWorker` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `ActiveWorkdayPauseForWorkerData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface ActiveWorkdayPauseForWorkerData {
  workdayPauses: ({
    pauseId: string;
    workdayId: string;
    workerLogin?: string | null;
    workerName?: string | null;
    deviceId?: string | null;
    pauseEventId?: string | null;
    startAt?: TimestampString | null;
    stopAt?: TimestampString | null;
    durationSec?: number | null;
    status?: string | null;
    createdAt?: TimestampString | null;
    updatedAt?: TimestampString | null;
  })[];
}
```
### Using `ActiveWorkdayPauseForWorker`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, activeWorkdayPauseForWorker, ActiveWorkdayPauseForWorkerVariables } from '@dataconnect/generated';

// The `ActiveWorkdayPauseForWorker` query requires an argument of type `ActiveWorkdayPauseForWorkerVariables`:
const activeWorkdayPauseForWorkerVars: ActiveWorkdayPauseForWorkerVariables = {
  orgId: ..., 
  workerLogin: ..., 
};

// Call the `activeWorkdayPauseForWorker()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await activeWorkdayPauseForWorker(activeWorkdayPauseForWorkerVars);
// Variables can be defined inline as well.
const { data } = await activeWorkdayPauseForWorker({ orgId: ..., workerLogin: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await activeWorkdayPauseForWorker(dataConnect, activeWorkdayPauseForWorkerVars);

console.log(data.workdayPauses);

// Or, you can use the `Promise` API.
activeWorkdayPauseForWorker(activeWorkdayPauseForWorkerVars).then((response) => {
  const data = response.data;
  console.log(data.workdayPauses);
});
```

### Using `ActiveWorkdayPauseForWorker`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, activeWorkdayPauseForWorkerRef, ActiveWorkdayPauseForWorkerVariables } from '@dataconnect/generated';

// The `ActiveWorkdayPauseForWorker` query requires an argument of type `ActiveWorkdayPauseForWorkerVariables`:
const activeWorkdayPauseForWorkerVars: ActiveWorkdayPauseForWorkerVariables = {
  orgId: ..., 
  workerLogin: ..., 
};

// Call the `activeWorkdayPauseForWorkerRef()` function to get a reference to the query.
const ref = activeWorkdayPauseForWorkerRef(activeWorkdayPauseForWorkerVars);
// Variables can be defined inline as well.
const ref = activeWorkdayPauseForWorkerRef({ orgId: ..., workerLogin: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = activeWorkdayPauseForWorkerRef(dataConnect, activeWorkdayPauseForWorkerVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.workdayPauses);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.workdayPauses);
});
```

# Mutations

There are two ways to execute a Data Connect Mutation using the generated Web SDK:
- Using a Mutation Reference function, which returns a `MutationRef`
  - The `MutationRef` can be used as an argument to `executeMutation()`, which will execute the Mutation and return a `MutationPromise`
- Using an action shortcut function, which returns a `MutationPromise`
  - Calling the action shortcut function will execute the Mutation and return a `MutationPromise`

The following is true for both the action shortcut function and the `MutationRef` function:
- The `MutationPromise` returned will resolve to the result of the Mutation once it has finished executing
- If the Mutation accepts arguments, both the action shortcut function and the `MutationRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Mutation
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `example` connector's generated functions to execute each mutation. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-mutations).

## InsertWorkerForOrg
You can execute the `InsertWorkerForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
insertWorkerForOrg(vars: InsertWorkerForOrgVariables): MutationPromise<InsertWorkerForOrgData, InsertWorkerForOrgVariables>;

interface InsertWorkerForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: InsertWorkerForOrgVariables): MutationRef<InsertWorkerForOrgData, InsertWorkerForOrgVariables>;
}
export const insertWorkerForOrgRef: InsertWorkerForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
insertWorkerForOrg(dc: DataConnect, vars: InsertWorkerForOrgVariables): MutationPromise<InsertWorkerForOrgData, InsertWorkerForOrgVariables>;

interface InsertWorkerForOrgRef {
  ...
  (dc: DataConnect, vars: InsertWorkerForOrgVariables): MutationRef<InsertWorkerForOrgData, InsertWorkerForOrgVariables>;
}
export const insertWorkerForOrgRef: InsertWorkerForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the insertWorkerForOrgRef:
```typescript
const name = insertWorkerForOrgRef.operationName;
console.log(name);
```

### Variables
The `InsertWorkerForOrg` mutation requires an argument of type `InsertWorkerForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface InsertWorkerForOrgVariables {
  orgId: string;
  login: string;
  workerName?: string | null;
  loginEmail?: string | null;
  role?: string | null;
  active?: boolean | null;
  email?: string | null;
  phone?: string | null;
  workerType?: string | null;
  workerId?: string | null;
}
```
### Return Type
Recall that executing the `InsertWorkerForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `InsertWorkerForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface InsertWorkerForOrgData {
  worker_insert: Worker_Key;
}
```
### Using `InsertWorkerForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, insertWorkerForOrg, InsertWorkerForOrgVariables } from '@dataconnect/generated';

// The `InsertWorkerForOrg` mutation requires an argument of type `InsertWorkerForOrgVariables`:
const insertWorkerForOrgVars: InsertWorkerForOrgVariables = {
  orgId: ..., 
  login: ..., 
  workerName: ..., // optional
  loginEmail: ..., // optional
  role: ..., // optional
  active: ..., // optional
  email: ..., // optional
  phone: ..., // optional
  workerType: ..., // optional
  workerId: ..., // optional
};

// Call the `insertWorkerForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await insertWorkerForOrg(insertWorkerForOrgVars);
// Variables can be defined inline as well.
const { data } = await insertWorkerForOrg({ orgId: ..., login: ..., workerName: ..., loginEmail: ..., role: ..., active: ..., email: ..., phone: ..., workerType: ..., workerId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await insertWorkerForOrg(dataConnect, insertWorkerForOrgVars);

console.log(data.worker_insert);

// Or, you can use the `Promise` API.
insertWorkerForOrg(insertWorkerForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.worker_insert);
});
```

### Using `InsertWorkerForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, insertWorkerForOrgRef, InsertWorkerForOrgVariables } from '@dataconnect/generated';

// The `InsertWorkerForOrg` mutation requires an argument of type `InsertWorkerForOrgVariables`:
const insertWorkerForOrgVars: InsertWorkerForOrgVariables = {
  orgId: ..., 
  login: ..., 
  workerName: ..., // optional
  loginEmail: ..., // optional
  role: ..., // optional
  active: ..., // optional
  email: ..., // optional
  phone: ..., // optional
  workerType: ..., // optional
  workerId: ..., // optional
};

// Call the `insertWorkerForOrgRef()` function to get a reference to the mutation.
const ref = insertWorkerForOrgRef(insertWorkerForOrgVars);
// Variables can be defined inline as well.
const ref = insertWorkerForOrgRef({ orgId: ..., login: ..., workerName: ..., loginEmail: ..., role: ..., active: ..., email: ..., phone: ..., workerType: ..., workerId: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = insertWorkerForOrgRef(dataConnect, insertWorkerForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.worker_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.worker_insert);
});
```

## InsertWorkerWithMembershipForOrg
You can execute the `InsertWorkerWithMembershipForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
insertWorkerWithMembershipForOrg(vars: InsertWorkerWithMembershipForOrgVariables): MutationPromise<InsertWorkerWithMembershipForOrgData, InsertWorkerWithMembershipForOrgVariables>;

interface InsertWorkerWithMembershipForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: InsertWorkerWithMembershipForOrgVariables): MutationRef<InsertWorkerWithMembershipForOrgData, InsertWorkerWithMembershipForOrgVariables>;
}
export const insertWorkerWithMembershipForOrgRef: InsertWorkerWithMembershipForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
insertWorkerWithMembershipForOrg(dc: DataConnect, vars: InsertWorkerWithMembershipForOrgVariables): MutationPromise<InsertWorkerWithMembershipForOrgData, InsertWorkerWithMembershipForOrgVariables>;

interface InsertWorkerWithMembershipForOrgRef {
  ...
  (dc: DataConnect, vars: InsertWorkerWithMembershipForOrgVariables): MutationRef<InsertWorkerWithMembershipForOrgData, InsertWorkerWithMembershipForOrgVariables>;
}
export const insertWorkerWithMembershipForOrgRef: InsertWorkerWithMembershipForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the insertWorkerWithMembershipForOrgRef:
```typescript
const name = insertWorkerWithMembershipForOrgRef.operationName;
console.log(name);
```

### Variables
The `InsertWorkerWithMembershipForOrg` mutation requires an argument of type `InsertWorkerWithMembershipForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface InsertWorkerWithMembershipForOrgVariables {
  orgId: string;
  login: string;
  workerName?: string | null;
  loginEmail?: string | null;
  authUid: string;
  role?: string | null;
  active?: boolean | null;
  email?: string | null;
  phone?: string | null;
  workerType?: string | null;
  workerId?: string | null;
}
```
### Return Type
Recall that executing the `InsertWorkerWithMembershipForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `InsertWorkerWithMembershipForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface InsertWorkerWithMembershipForOrgData {
  worker_insert: Worker_Key;
  organizationMember_upsert: OrganizationMember_Key;
}
```
### Using `InsertWorkerWithMembershipForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, insertWorkerWithMembershipForOrg, InsertWorkerWithMembershipForOrgVariables } from '@dataconnect/generated';

// The `InsertWorkerWithMembershipForOrg` mutation requires an argument of type `InsertWorkerWithMembershipForOrgVariables`:
const insertWorkerWithMembershipForOrgVars: InsertWorkerWithMembershipForOrgVariables = {
  orgId: ..., 
  login: ..., 
  workerName: ..., // optional
  loginEmail: ..., // optional
  authUid: ..., 
  role: ..., // optional
  active: ..., // optional
  email: ..., // optional
  phone: ..., // optional
  workerType: ..., // optional
  workerId: ..., // optional
};

// Call the `insertWorkerWithMembershipForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await insertWorkerWithMembershipForOrg(insertWorkerWithMembershipForOrgVars);
// Variables can be defined inline as well.
const { data } = await insertWorkerWithMembershipForOrg({ orgId: ..., login: ..., workerName: ..., loginEmail: ..., authUid: ..., role: ..., active: ..., email: ..., phone: ..., workerType: ..., workerId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await insertWorkerWithMembershipForOrg(dataConnect, insertWorkerWithMembershipForOrgVars);

console.log(data.worker_insert);
console.log(data.organizationMember_upsert);

// Or, you can use the `Promise` API.
insertWorkerWithMembershipForOrg(insertWorkerWithMembershipForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.worker_insert);
  console.log(data.organizationMember_upsert);
});
```

### Using `InsertWorkerWithMembershipForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, insertWorkerWithMembershipForOrgRef, InsertWorkerWithMembershipForOrgVariables } from '@dataconnect/generated';

// The `InsertWorkerWithMembershipForOrg` mutation requires an argument of type `InsertWorkerWithMembershipForOrgVariables`:
const insertWorkerWithMembershipForOrgVars: InsertWorkerWithMembershipForOrgVariables = {
  orgId: ..., 
  login: ..., 
  workerName: ..., // optional
  loginEmail: ..., // optional
  authUid: ..., 
  role: ..., // optional
  active: ..., // optional
  email: ..., // optional
  phone: ..., // optional
  workerType: ..., // optional
  workerId: ..., // optional
};

// Call the `insertWorkerWithMembershipForOrgRef()` function to get a reference to the mutation.
const ref = insertWorkerWithMembershipForOrgRef(insertWorkerWithMembershipForOrgVars);
// Variables can be defined inline as well.
const ref = insertWorkerWithMembershipForOrgRef({ orgId: ..., login: ..., workerName: ..., loginEmail: ..., authUid: ..., role: ..., active: ..., email: ..., phone: ..., workerType: ..., workerId: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = insertWorkerWithMembershipForOrgRef(dataConnect, insertWorkerWithMembershipForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.worker_insert);
console.log(data.organizationMember_upsert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.worker_insert);
  console.log(data.organizationMember_upsert);
});
```

## UpdateWorkerForOrg
You can execute the `UpdateWorkerForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
updateWorkerForOrg(vars: UpdateWorkerForOrgVariables): MutationPromise<UpdateWorkerForOrgData, UpdateWorkerForOrgVariables>;

interface UpdateWorkerForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateWorkerForOrgVariables): MutationRef<UpdateWorkerForOrgData, UpdateWorkerForOrgVariables>;
}
export const updateWorkerForOrgRef: UpdateWorkerForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
updateWorkerForOrg(dc: DataConnect, vars: UpdateWorkerForOrgVariables): MutationPromise<UpdateWorkerForOrgData, UpdateWorkerForOrgVariables>;

interface UpdateWorkerForOrgRef {
  ...
  (dc: DataConnect, vars: UpdateWorkerForOrgVariables): MutationRef<UpdateWorkerForOrgData, UpdateWorkerForOrgVariables>;
}
export const updateWorkerForOrgRef: UpdateWorkerForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the updateWorkerForOrgRef:
```typescript
const name = updateWorkerForOrgRef.operationName;
console.log(name);
```

### Variables
The `UpdateWorkerForOrg` mutation requires an argument of type `UpdateWorkerForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface UpdateWorkerForOrgVariables {
  orgId: string;
  login: string;
  workerName?: string | null;
  loginEmail?: string | null;
  role?: string | null;
  active?: boolean | null;
  email?: string | null;
  phone?: string | null;
  workerType?: string | null;
  workerId?: string | null;
  edit?: string | null;
}
```
### Return Type
Recall that executing the `UpdateWorkerForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `UpdateWorkerForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface UpdateWorkerForOrgData {
  worker_update?: Worker_Key | null;
}
```
### Using `UpdateWorkerForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, updateWorkerForOrg, UpdateWorkerForOrgVariables } from '@dataconnect/generated';

// The `UpdateWorkerForOrg` mutation requires an argument of type `UpdateWorkerForOrgVariables`:
const updateWorkerForOrgVars: UpdateWorkerForOrgVariables = {
  orgId: ..., 
  login: ..., 
  workerName: ..., // optional
  loginEmail: ..., // optional
  role: ..., // optional
  active: ..., // optional
  email: ..., // optional
  phone: ..., // optional
  workerType: ..., // optional
  workerId: ..., // optional
  edit: ..., // optional
};

// Call the `updateWorkerForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await updateWorkerForOrg(updateWorkerForOrgVars);
// Variables can be defined inline as well.
const { data } = await updateWorkerForOrg({ orgId: ..., login: ..., workerName: ..., loginEmail: ..., role: ..., active: ..., email: ..., phone: ..., workerType: ..., workerId: ..., edit: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await updateWorkerForOrg(dataConnect, updateWorkerForOrgVars);

console.log(data.worker_update);

// Or, you can use the `Promise` API.
updateWorkerForOrg(updateWorkerForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.worker_update);
});
```

### Using `UpdateWorkerForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, updateWorkerForOrgRef, UpdateWorkerForOrgVariables } from '@dataconnect/generated';

// The `UpdateWorkerForOrg` mutation requires an argument of type `UpdateWorkerForOrgVariables`:
const updateWorkerForOrgVars: UpdateWorkerForOrgVariables = {
  orgId: ..., 
  login: ..., 
  workerName: ..., // optional
  loginEmail: ..., // optional
  role: ..., // optional
  active: ..., // optional
  email: ..., // optional
  phone: ..., // optional
  workerType: ..., // optional
  workerId: ..., // optional
  edit: ..., // optional
};

// Call the `updateWorkerForOrgRef()` function to get a reference to the mutation.
const ref = updateWorkerForOrgRef(updateWorkerForOrgVars);
// Variables can be defined inline as well.
const ref = updateWorkerForOrgRef({ orgId: ..., login: ..., workerName: ..., loginEmail: ..., role: ..., active: ..., email: ..., phone: ..., workerType: ..., workerId: ..., edit: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = updateWorkerForOrgRef(dataConnect, updateWorkerForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.worker_update);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.worker_update);
});
```

## UpsertWorkerCredentialForOrg
You can execute the `UpsertWorkerCredentialForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
upsertWorkerCredentialForOrg(vars: UpsertWorkerCredentialForOrgVariables): MutationPromise<UpsertWorkerCredentialForOrgData, UpsertWorkerCredentialForOrgVariables>;

interface UpsertWorkerCredentialForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpsertWorkerCredentialForOrgVariables): MutationRef<UpsertWorkerCredentialForOrgData, UpsertWorkerCredentialForOrgVariables>;
}
export const upsertWorkerCredentialForOrgRef: UpsertWorkerCredentialForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
upsertWorkerCredentialForOrg(dc: DataConnect, vars: UpsertWorkerCredentialForOrgVariables): MutationPromise<UpsertWorkerCredentialForOrgData, UpsertWorkerCredentialForOrgVariables>;

interface UpsertWorkerCredentialForOrgRef {
  ...
  (dc: DataConnect, vars: UpsertWorkerCredentialForOrgVariables): MutationRef<UpsertWorkerCredentialForOrgData, UpsertWorkerCredentialForOrgVariables>;
}
export const upsertWorkerCredentialForOrgRef: UpsertWorkerCredentialForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the upsertWorkerCredentialForOrgRef:
```typescript
const name = upsertWorkerCredentialForOrgRef.operationName;
console.log(name);
```

### Variables
The `UpsertWorkerCredentialForOrg` mutation requires an argument of type `UpsertWorkerCredentialForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface UpsertWorkerCredentialForOrgVariables {
  orgId: string;
  login: string;
  encryptedPassword: string;
  iv: string;
  authTag: string;
  algorithm: string;
  updatedBy?: string | null;
}
```
### Return Type
Recall that executing the `UpsertWorkerCredentialForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `UpsertWorkerCredentialForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface UpsertWorkerCredentialForOrgData {
  workerCredential_upsert: WorkerCredential_Key;
}
```
### Using `UpsertWorkerCredentialForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, upsertWorkerCredentialForOrg, UpsertWorkerCredentialForOrgVariables } from '@dataconnect/generated';

// The `UpsertWorkerCredentialForOrg` mutation requires an argument of type `UpsertWorkerCredentialForOrgVariables`:
const upsertWorkerCredentialForOrgVars: UpsertWorkerCredentialForOrgVariables = {
  orgId: ..., 
  login: ..., 
  encryptedPassword: ..., 
  iv: ..., 
  authTag: ..., 
  algorithm: ..., 
  updatedBy: ..., // optional
};

// Call the `upsertWorkerCredentialForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await upsertWorkerCredentialForOrg(upsertWorkerCredentialForOrgVars);
// Variables can be defined inline as well.
const { data } = await upsertWorkerCredentialForOrg({ orgId: ..., login: ..., encryptedPassword: ..., iv: ..., authTag: ..., algorithm: ..., updatedBy: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await upsertWorkerCredentialForOrg(dataConnect, upsertWorkerCredentialForOrgVars);

console.log(data.workerCredential_upsert);

// Or, you can use the `Promise` API.
upsertWorkerCredentialForOrg(upsertWorkerCredentialForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.workerCredential_upsert);
});
```

### Using `UpsertWorkerCredentialForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, upsertWorkerCredentialForOrgRef, UpsertWorkerCredentialForOrgVariables } from '@dataconnect/generated';

// The `UpsertWorkerCredentialForOrg` mutation requires an argument of type `UpsertWorkerCredentialForOrgVariables`:
const upsertWorkerCredentialForOrgVars: UpsertWorkerCredentialForOrgVariables = {
  orgId: ..., 
  login: ..., 
  encryptedPassword: ..., 
  iv: ..., 
  authTag: ..., 
  algorithm: ..., 
  updatedBy: ..., // optional
};

// Call the `upsertWorkerCredentialForOrgRef()` function to get a reference to the mutation.
const ref = upsertWorkerCredentialForOrgRef(upsertWorkerCredentialForOrgVars);
// Variables can be defined inline as well.
const ref = upsertWorkerCredentialForOrgRef({ orgId: ..., login: ..., encryptedPassword: ..., iv: ..., authTag: ..., algorithm: ..., updatedBy: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = upsertWorkerCredentialForOrgRef(dataConnect, upsertWorkerCredentialForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.workerCredential_upsert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.workerCredential_upsert);
});
```

## UpsertOrgUiStyleForOrg
You can execute the `UpsertOrgUiStyleForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
upsertOrgUiStyleForOrg(vars: UpsertOrgUiStyleForOrgVariables): MutationPromise<UpsertOrgUiStyleForOrgData, UpsertOrgUiStyleForOrgVariables>;

interface UpsertOrgUiStyleForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpsertOrgUiStyleForOrgVariables): MutationRef<UpsertOrgUiStyleForOrgData, UpsertOrgUiStyleForOrgVariables>;
}
export const upsertOrgUiStyleForOrgRef: UpsertOrgUiStyleForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
upsertOrgUiStyleForOrg(dc: DataConnect, vars: UpsertOrgUiStyleForOrgVariables): MutationPromise<UpsertOrgUiStyleForOrgData, UpsertOrgUiStyleForOrgVariables>;

interface UpsertOrgUiStyleForOrgRef {
  ...
  (dc: DataConnect, vars: UpsertOrgUiStyleForOrgVariables): MutationRef<UpsertOrgUiStyleForOrgData, UpsertOrgUiStyleForOrgVariables>;
}
export const upsertOrgUiStyleForOrgRef: UpsertOrgUiStyleForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the upsertOrgUiStyleForOrgRef:
```typescript
const name = upsertOrgUiStyleForOrgRef.operationName;
console.log(name);
```

### Variables
The `UpsertOrgUiStyleForOrg` mutation requires an argument of type `UpsertOrgUiStyleForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface UpsertOrgUiStyleForOrgVariables {
  orgId: string;
  styleId: string;
  updatedBy?: string | null;
}
```
### Return Type
Recall that executing the `UpsertOrgUiStyleForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `UpsertOrgUiStyleForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface UpsertOrgUiStyleForOrgData {
  orgUiStyle_upsert: OrgUiStyle_Key;
}
```
### Using `UpsertOrgUiStyleForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, upsertOrgUiStyleForOrg, UpsertOrgUiStyleForOrgVariables } from '@dataconnect/generated';

// The `UpsertOrgUiStyleForOrg` mutation requires an argument of type `UpsertOrgUiStyleForOrgVariables`:
const upsertOrgUiStyleForOrgVars: UpsertOrgUiStyleForOrgVariables = {
  orgId: ..., 
  styleId: ..., 
  updatedBy: ..., // optional
};

// Call the `upsertOrgUiStyleForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await upsertOrgUiStyleForOrg(upsertOrgUiStyleForOrgVars);
// Variables can be defined inline as well.
const { data } = await upsertOrgUiStyleForOrg({ orgId: ..., styleId: ..., updatedBy: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await upsertOrgUiStyleForOrg(dataConnect, upsertOrgUiStyleForOrgVars);

console.log(data.orgUiStyle_upsert);

// Or, you can use the `Promise` API.
upsertOrgUiStyleForOrg(upsertOrgUiStyleForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.orgUiStyle_upsert);
});
```

### Using `UpsertOrgUiStyleForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, upsertOrgUiStyleForOrgRef, UpsertOrgUiStyleForOrgVariables } from '@dataconnect/generated';

// The `UpsertOrgUiStyleForOrg` mutation requires an argument of type `UpsertOrgUiStyleForOrgVariables`:
const upsertOrgUiStyleForOrgVars: UpsertOrgUiStyleForOrgVariables = {
  orgId: ..., 
  styleId: ..., 
  updatedBy: ..., // optional
};

// Call the `upsertOrgUiStyleForOrgRef()` function to get a reference to the mutation.
const ref = upsertOrgUiStyleForOrgRef(upsertOrgUiStyleForOrgVars);
// Variables can be defined inline as well.
const ref = upsertOrgUiStyleForOrgRef({ orgId: ..., styleId: ..., updatedBy: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = upsertOrgUiStyleForOrgRef(dataConnect, upsertOrgUiStyleForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.orgUiStyle_upsert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.orgUiStyle_upsert);
});
```

## DeleteOrgUiStyleForOrg
You can execute the `DeleteOrgUiStyleForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
deleteOrgUiStyleForOrg(vars: DeleteOrgUiStyleForOrgVariables): MutationPromise<DeleteOrgUiStyleForOrgData, DeleteOrgUiStyleForOrgVariables>;

interface DeleteOrgUiStyleForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: DeleteOrgUiStyleForOrgVariables): MutationRef<DeleteOrgUiStyleForOrgData, DeleteOrgUiStyleForOrgVariables>;
}
export const deleteOrgUiStyleForOrgRef: DeleteOrgUiStyleForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
deleteOrgUiStyleForOrg(dc: DataConnect, vars: DeleteOrgUiStyleForOrgVariables): MutationPromise<DeleteOrgUiStyleForOrgData, DeleteOrgUiStyleForOrgVariables>;

interface DeleteOrgUiStyleForOrgRef {
  ...
  (dc: DataConnect, vars: DeleteOrgUiStyleForOrgVariables): MutationRef<DeleteOrgUiStyleForOrgData, DeleteOrgUiStyleForOrgVariables>;
}
export const deleteOrgUiStyleForOrgRef: DeleteOrgUiStyleForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the deleteOrgUiStyleForOrgRef:
```typescript
const name = deleteOrgUiStyleForOrgRef.operationName;
console.log(name);
```

### Variables
The `DeleteOrgUiStyleForOrg` mutation requires an argument of type `DeleteOrgUiStyleForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface DeleteOrgUiStyleForOrgVariables {
  orgId: string;
}
```
### Return Type
Recall that executing the `DeleteOrgUiStyleForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `DeleteOrgUiStyleForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface DeleteOrgUiStyleForOrgData {
  orgUiStyle_delete?: OrgUiStyle_Key | null;
}
```
### Using `DeleteOrgUiStyleForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, deleteOrgUiStyleForOrg, DeleteOrgUiStyleForOrgVariables } from '@dataconnect/generated';

// The `DeleteOrgUiStyleForOrg` mutation requires an argument of type `DeleteOrgUiStyleForOrgVariables`:
const deleteOrgUiStyleForOrgVars: DeleteOrgUiStyleForOrgVariables = {
  orgId: ..., 
};

// Call the `deleteOrgUiStyleForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await deleteOrgUiStyleForOrg(deleteOrgUiStyleForOrgVars);
// Variables can be defined inline as well.
const { data } = await deleteOrgUiStyleForOrg({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await deleteOrgUiStyleForOrg(dataConnect, deleteOrgUiStyleForOrgVars);

console.log(data.orgUiStyle_delete);

// Or, you can use the `Promise` API.
deleteOrgUiStyleForOrg(deleteOrgUiStyleForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.orgUiStyle_delete);
});
```

### Using `DeleteOrgUiStyleForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, deleteOrgUiStyleForOrgRef, DeleteOrgUiStyleForOrgVariables } from '@dataconnect/generated';

// The `DeleteOrgUiStyleForOrg` mutation requires an argument of type `DeleteOrgUiStyleForOrgVariables`:
const deleteOrgUiStyleForOrgVars: DeleteOrgUiStyleForOrgVariables = {
  orgId: ..., 
};

// Call the `deleteOrgUiStyleForOrgRef()` function to get a reference to the mutation.
const ref = deleteOrgUiStyleForOrgRef(deleteOrgUiStyleForOrgVars);
// Variables can be defined inline as well.
const ref = deleteOrgUiStyleForOrgRef({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = deleteOrgUiStyleForOrgRef(dataConnect, deleteOrgUiStyleForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.orgUiStyle_delete);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.orgUiStyle_delete);
});
```

## UpsertMyUiStylePreference
You can execute the `UpsertMyUiStylePreference` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
upsertMyUiStylePreference(vars: UpsertMyUiStylePreferenceVariables): MutationPromise<UpsertMyUiStylePreferenceData, UpsertMyUiStylePreferenceVariables>;

interface UpsertMyUiStylePreferenceRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpsertMyUiStylePreferenceVariables): MutationRef<UpsertMyUiStylePreferenceData, UpsertMyUiStylePreferenceVariables>;
}
export const upsertMyUiStylePreferenceRef: UpsertMyUiStylePreferenceRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
upsertMyUiStylePreference(dc: DataConnect, vars: UpsertMyUiStylePreferenceVariables): MutationPromise<UpsertMyUiStylePreferenceData, UpsertMyUiStylePreferenceVariables>;

interface UpsertMyUiStylePreferenceRef {
  ...
  (dc: DataConnect, vars: UpsertMyUiStylePreferenceVariables): MutationRef<UpsertMyUiStylePreferenceData, UpsertMyUiStylePreferenceVariables>;
}
export const upsertMyUiStylePreferenceRef: UpsertMyUiStylePreferenceRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the upsertMyUiStylePreferenceRef:
```typescript
const name = upsertMyUiStylePreferenceRef.operationName;
console.log(name);
```

### Variables
The `UpsertMyUiStylePreference` mutation requires an argument of type `UpsertMyUiStylePreferenceVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface UpsertMyUiStylePreferenceVariables {
  orgId: string;
  styleId: string;
  updatedBy?: string | null;
}
```
### Return Type
Recall that executing the `UpsertMyUiStylePreference` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `UpsertMyUiStylePreferenceData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface UpsertMyUiStylePreferenceData {
  userUiStylePreference_upsert: UserUiStylePreference_Key;
}
```
### Using `UpsertMyUiStylePreference`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, upsertMyUiStylePreference, UpsertMyUiStylePreferenceVariables } from '@dataconnect/generated';

// The `UpsertMyUiStylePreference` mutation requires an argument of type `UpsertMyUiStylePreferenceVariables`:
const upsertMyUiStylePreferenceVars: UpsertMyUiStylePreferenceVariables = {
  orgId: ..., 
  styleId: ..., 
  updatedBy: ..., // optional
};

// Call the `upsertMyUiStylePreference()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await upsertMyUiStylePreference(upsertMyUiStylePreferenceVars);
// Variables can be defined inline as well.
const { data } = await upsertMyUiStylePreference({ orgId: ..., styleId: ..., updatedBy: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await upsertMyUiStylePreference(dataConnect, upsertMyUiStylePreferenceVars);

console.log(data.userUiStylePreference_upsert);

// Or, you can use the `Promise` API.
upsertMyUiStylePreference(upsertMyUiStylePreferenceVars).then((response) => {
  const data = response.data;
  console.log(data.userUiStylePreference_upsert);
});
```

### Using `UpsertMyUiStylePreference`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, upsertMyUiStylePreferenceRef, UpsertMyUiStylePreferenceVariables } from '@dataconnect/generated';

// The `UpsertMyUiStylePreference` mutation requires an argument of type `UpsertMyUiStylePreferenceVariables`:
const upsertMyUiStylePreferenceVars: UpsertMyUiStylePreferenceVariables = {
  orgId: ..., 
  styleId: ..., 
  updatedBy: ..., // optional
};

// Call the `upsertMyUiStylePreferenceRef()` function to get a reference to the mutation.
const ref = upsertMyUiStylePreferenceRef(upsertMyUiStylePreferenceVars);
// Variables can be defined inline as well.
const ref = upsertMyUiStylePreferenceRef({ orgId: ..., styleId: ..., updatedBy: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = upsertMyUiStylePreferenceRef(dataConnect, upsertMyUiStylePreferenceVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.userUiStylePreference_upsert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.userUiStylePreference_upsert);
});
```

## DeleteMyUiStylePreference
You can execute the `DeleteMyUiStylePreference` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
deleteMyUiStylePreference(vars: DeleteMyUiStylePreferenceVariables): MutationPromise<DeleteMyUiStylePreferenceData, DeleteMyUiStylePreferenceVariables>;

interface DeleteMyUiStylePreferenceRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: DeleteMyUiStylePreferenceVariables): MutationRef<DeleteMyUiStylePreferenceData, DeleteMyUiStylePreferenceVariables>;
}
export const deleteMyUiStylePreferenceRef: DeleteMyUiStylePreferenceRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
deleteMyUiStylePreference(dc: DataConnect, vars: DeleteMyUiStylePreferenceVariables): MutationPromise<DeleteMyUiStylePreferenceData, DeleteMyUiStylePreferenceVariables>;

interface DeleteMyUiStylePreferenceRef {
  ...
  (dc: DataConnect, vars: DeleteMyUiStylePreferenceVariables): MutationRef<DeleteMyUiStylePreferenceData, DeleteMyUiStylePreferenceVariables>;
}
export const deleteMyUiStylePreferenceRef: DeleteMyUiStylePreferenceRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the deleteMyUiStylePreferenceRef:
```typescript
const name = deleteMyUiStylePreferenceRef.operationName;
console.log(name);
```

### Variables
The `DeleteMyUiStylePreference` mutation requires an argument of type `DeleteMyUiStylePreferenceVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface DeleteMyUiStylePreferenceVariables {
  orgId: string;
}
```
### Return Type
Recall that executing the `DeleteMyUiStylePreference` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `DeleteMyUiStylePreferenceData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface DeleteMyUiStylePreferenceData {
  userUiStylePreference_delete?: UserUiStylePreference_Key | null;
}
```
### Using `DeleteMyUiStylePreference`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, deleteMyUiStylePreference, DeleteMyUiStylePreferenceVariables } from '@dataconnect/generated';

// The `DeleteMyUiStylePreference` mutation requires an argument of type `DeleteMyUiStylePreferenceVariables`:
const deleteMyUiStylePreferenceVars: DeleteMyUiStylePreferenceVariables = {
  orgId: ..., 
};

// Call the `deleteMyUiStylePreference()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await deleteMyUiStylePreference(deleteMyUiStylePreferenceVars);
// Variables can be defined inline as well.
const { data } = await deleteMyUiStylePreference({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await deleteMyUiStylePreference(dataConnect, deleteMyUiStylePreferenceVars);

console.log(data.userUiStylePreference_delete);

// Or, you can use the `Promise` API.
deleteMyUiStylePreference(deleteMyUiStylePreferenceVars).then((response) => {
  const data = response.data;
  console.log(data.userUiStylePreference_delete);
});
```

### Using `DeleteMyUiStylePreference`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, deleteMyUiStylePreferenceRef, DeleteMyUiStylePreferenceVariables } from '@dataconnect/generated';

// The `DeleteMyUiStylePreference` mutation requires an argument of type `DeleteMyUiStylePreferenceVariables`:
const deleteMyUiStylePreferenceVars: DeleteMyUiStylePreferenceVariables = {
  orgId: ..., 
};

// Call the `deleteMyUiStylePreferenceRef()` function to get a reference to the mutation.
const ref = deleteMyUiStylePreferenceRef(deleteMyUiStylePreferenceVars);
// Variables can be defined inline as well.
const ref = deleteMyUiStylePreferenceRef({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = deleteMyUiStylePreferenceRef(dataConnect, deleteMyUiStylePreferenceVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.userUiStylePreference_delete);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.userUiStylePreference_delete);
});
```

## UpsertUserUiStylePreferenceForOrg
You can execute the `UpsertUserUiStylePreferenceForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
upsertUserUiStylePreferenceForOrg(vars: UpsertUserUiStylePreferenceForOrgVariables): MutationPromise<UpsertUserUiStylePreferenceForOrgData, UpsertUserUiStylePreferenceForOrgVariables>;

interface UpsertUserUiStylePreferenceForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpsertUserUiStylePreferenceForOrgVariables): MutationRef<UpsertUserUiStylePreferenceForOrgData, UpsertUserUiStylePreferenceForOrgVariables>;
}
export const upsertUserUiStylePreferenceForOrgRef: UpsertUserUiStylePreferenceForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
upsertUserUiStylePreferenceForOrg(dc: DataConnect, vars: UpsertUserUiStylePreferenceForOrgVariables): MutationPromise<UpsertUserUiStylePreferenceForOrgData, UpsertUserUiStylePreferenceForOrgVariables>;

interface UpsertUserUiStylePreferenceForOrgRef {
  ...
  (dc: DataConnect, vars: UpsertUserUiStylePreferenceForOrgVariables): MutationRef<UpsertUserUiStylePreferenceForOrgData, UpsertUserUiStylePreferenceForOrgVariables>;
}
export const upsertUserUiStylePreferenceForOrgRef: UpsertUserUiStylePreferenceForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the upsertUserUiStylePreferenceForOrgRef:
```typescript
const name = upsertUserUiStylePreferenceForOrgRef.operationName;
console.log(name);
```

### Variables
The `UpsertUserUiStylePreferenceForOrg` mutation requires an argument of type `UpsertUserUiStylePreferenceForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface UpsertUserUiStylePreferenceForOrgVariables {
  orgId: string;
  uid: string;
  styleId: string;
  updatedBy?: string | null;
}
```
### Return Type
Recall that executing the `UpsertUserUiStylePreferenceForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `UpsertUserUiStylePreferenceForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface UpsertUserUiStylePreferenceForOrgData {
  userUiStylePreference_upsert: UserUiStylePreference_Key;
}
```
### Using `UpsertUserUiStylePreferenceForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, upsertUserUiStylePreferenceForOrg, UpsertUserUiStylePreferenceForOrgVariables } from '@dataconnect/generated';

// The `UpsertUserUiStylePreferenceForOrg` mutation requires an argument of type `UpsertUserUiStylePreferenceForOrgVariables`:
const upsertUserUiStylePreferenceForOrgVars: UpsertUserUiStylePreferenceForOrgVariables = {
  orgId: ..., 
  uid: ..., 
  styleId: ..., 
  updatedBy: ..., // optional
};

// Call the `upsertUserUiStylePreferenceForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await upsertUserUiStylePreferenceForOrg(upsertUserUiStylePreferenceForOrgVars);
// Variables can be defined inline as well.
const { data } = await upsertUserUiStylePreferenceForOrg({ orgId: ..., uid: ..., styleId: ..., updatedBy: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await upsertUserUiStylePreferenceForOrg(dataConnect, upsertUserUiStylePreferenceForOrgVars);

console.log(data.userUiStylePreference_upsert);

// Or, you can use the `Promise` API.
upsertUserUiStylePreferenceForOrg(upsertUserUiStylePreferenceForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.userUiStylePreference_upsert);
});
```

### Using `UpsertUserUiStylePreferenceForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, upsertUserUiStylePreferenceForOrgRef, UpsertUserUiStylePreferenceForOrgVariables } from '@dataconnect/generated';

// The `UpsertUserUiStylePreferenceForOrg` mutation requires an argument of type `UpsertUserUiStylePreferenceForOrgVariables`:
const upsertUserUiStylePreferenceForOrgVars: UpsertUserUiStylePreferenceForOrgVariables = {
  orgId: ..., 
  uid: ..., 
  styleId: ..., 
  updatedBy: ..., // optional
};

// Call the `upsertUserUiStylePreferenceForOrgRef()` function to get a reference to the mutation.
const ref = upsertUserUiStylePreferenceForOrgRef(upsertUserUiStylePreferenceForOrgVars);
// Variables can be defined inline as well.
const ref = upsertUserUiStylePreferenceForOrgRef({ orgId: ..., uid: ..., styleId: ..., updatedBy: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = upsertUserUiStylePreferenceForOrgRef(dataConnect, upsertUserUiStylePreferenceForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.userUiStylePreference_upsert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.userUiStylePreference_upsert);
});
```

## DeleteUserUiStylePreferenceForOrg
You can execute the `DeleteUserUiStylePreferenceForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
deleteUserUiStylePreferenceForOrg(vars: DeleteUserUiStylePreferenceForOrgVariables): MutationPromise<DeleteUserUiStylePreferenceForOrgData, DeleteUserUiStylePreferenceForOrgVariables>;

interface DeleteUserUiStylePreferenceForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: DeleteUserUiStylePreferenceForOrgVariables): MutationRef<DeleteUserUiStylePreferenceForOrgData, DeleteUserUiStylePreferenceForOrgVariables>;
}
export const deleteUserUiStylePreferenceForOrgRef: DeleteUserUiStylePreferenceForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
deleteUserUiStylePreferenceForOrg(dc: DataConnect, vars: DeleteUserUiStylePreferenceForOrgVariables): MutationPromise<DeleteUserUiStylePreferenceForOrgData, DeleteUserUiStylePreferenceForOrgVariables>;

interface DeleteUserUiStylePreferenceForOrgRef {
  ...
  (dc: DataConnect, vars: DeleteUserUiStylePreferenceForOrgVariables): MutationRef<DeleteUserUiStylePreferenceForOrgData, DeleteUserUiStylePreferenceForOrgVariables>;
}
export const deleteUserUiStylePreferenceForOrgRef: DeleteUserUiStylePreferenceForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the deleteUserUiStylePreferenceForOrgRef:
```typescript
const name = deleteUserUiStylePreferenceForOrgRef.operationName;
console.log(name);
```

### Variables
The `DeleteUserUiStylePreferenceForOrg` mutation requires an argument of type `DeleteUserUiStylePreferenceForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface DeleteUserUiStylePreferenceForOrgVariables {
  orgId: string;
  uid: string;
}
```
### Return Type
Recall that executing the `DeleteUserUiStylePreferenceForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `DeleteUserUiStylePreferenceForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface DeleteUserUiStylePreferenceForOrgData {
  userUiStylePreference_delete?: UserUiStylePreference_Key | null;
}
```
### Using `DeleteUserUiStylePreferenceForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, deleteUserUiStylePreferenceForOrg, DeleteUserUiStylePreferenceForOrgVariables } from '@dataconnect/generated';

// The `DeleteUserUiStylePreferenceForOrg` mutation requires an argument of type `DeleteUserUiStylePreferenceForOrgVariables`:
const deleteUserUiStylePreferenceForOrgVars: DeleteUserUiStylePreferenceForOrgVariables = {
  orgId: ..., 
  uid: ..., 
};

// Call the `deleteUserUiStylePreferenceForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await deleteUserUiStylePreferenceForOrg(deleteUserUiStylePreferenceForOrgVars);
// Variables can be defined inline as well.
const { data } = await deleteUserUiStylePreferenceForOrg({ orgId: ..., uid: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await deleteUserUiStylePreferenceForOrg(dataConnect, deleteUserUiStylePreferenceForOrgVars);

console.log(data.userUiStylePreference_delete);

// Or, you can use the `Promise` API.
deleteUserUiStylePreferenceForOrg(deleteUserUiStylePreferenceForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.userUiStylePreference_delete);
});
```

### Using `DeleteUserUiStylePreferenceForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, deleteUserUiStylePreferenceForOrgRef, DeleteUserUiStylePreferenceForOrgVariables } from '@dataconnect/generated';

// The `DeleteUserUiStylePreferenceForOrg` mutation requires an argument of type `DeleteUserUiStylePreferenceForOrgVariables`:
const deleteUserUiStylePreferenceForOrgVars: DeleteUserUiStylePreferenceForOrgVariables = {
  orgId: ..., 
  uid: ..., 
};

// Call the `deleteUserUiStylePreferenceForOrgRef()` function to get a reference to the mutation.
const ref = deleteUserUiStylePreferenceForOrgRef(deleteUserUiStylePreferenceForOrgVars);
// Variables can be defined inline as well.
const ref = deleteUserUiStylePreferenceForOrgRef({ orgId: ..., uid: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = deleteUserUiStylePreferenceForOrgRef(dataConnect, deleteUserUiStylePreferenceForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.userUiStylePreference_delete);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.userUiStylePreference_delete);
});
```

## InsertClientForOrg
You can execute the `InsertClientForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
insertClientForOrg(vars: InsertClientForOrgVariables): MutationPromise<InsertClientForOrgData, InsertClientForOrgVariables>;

interface InsertClientForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: InsertClientForOrgVariables): MutationRef<InsertClientForOrgData, InsertClientForOrgVariables>;
}
export const insertClientForOrgRef: InsertClientForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
insertClientForOrg(dc: DataConnect, vars: InsertClientForOrgVariables): MutationPromise<InsertClientForOrgData, InsertClientForOrgVariables>;

interface InsertClientForOrgRef {
  ...
  (dc: DataConnect, vars: InsertClientForOrgVariables): MutationRef<InsertClientForOrgData, InsertClientForOrgVariables>;
}
export const insertClientForOrgRef: InsertClientForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the insertClientForOrgRef:
```typescript
const name = insertClientForOrgRef.operationName;
console.log(name);
```

### Variables
The `InsertClientForOrg` mutation requires an argument of type `InsertClientForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface InsertClientForOrgVariables {
  orgId: string;
  clientId: string;
  name?: string | null;
  nip?: string | null;
  city?: string | null;
  address?: string | null;
  contact?: string | null;
  status?: string | null;
  coordinator?: string | null;
  serviceFrequency?: string | null;
  assignees?: string | null;
  chemistry?: string | null;
  equipment?: string | null;
  clientInfo?: string | null;
}
```
### Return Type
Recall that executing the `InsertClientForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `InsertClientForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface InsertClientForOrgData {
  client_insert: Client_Key;
}
```
### Using `InsertClientForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, insertClientForOrg, InsertClientForOrgVariables } from '@dataconnect/generated';

// The `InsertClientForOrg` mutation requires an argument of type `InsertClientForOrgVariables`:
const insertClientForOrgVars: InsertClientForOrgVariables = {
  orgId: ..., 
  clientId: ..., 
  name: ..., // optional
  nip: ..., // optional
  city: ..., // optional
  address: ..., // optional
  contact: ..., // optional
  status: ..., // optional
  coordinator: ..., // optional
  serviceFrequency: ..., // optional
  assignees: ..., // optional
  chemistry: ..., // optional
  equipment: ..., // optional
  clientInfo: ..., // optional
};

// Call the `insertClientForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await insertClientForOrg(insertClientForOrgVars);
// Variables can be defined inline as well.
const { data } = await insertClientForOrg({ orgId: ..., clientId: ..., name: ..., nip: ..., city: ..., address: ..., contact: ..., status: ..., coordinator: ..., serviceFrequency: ..., assignees: ..., chemistry: ..., equipment: ..., clientInfo: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await insertClientForOrg(dataConnect, insertClientForOrgVars);

console.log(data.client_insert);

// Or, you can use the `Promise` API.
insertClientForOrg(insertClientForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.client_insert);
});
```

### Using `InsertClientForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, insertClientForOrgRef, InsertClientForOrgVariables } from '@dataconnect/generated';

// The `InsertClientForOrg` mutation requires an argument of type `InsertClientForOrgVariables`:
const insertClientForOrgVars: InsertClientForOrgVariables = {
  orgId: ..., 
  clientId: ..., 
  name: ..., // optional
  nip: ..., // optional
  city: ..., // optional
  address: ..., // optional
  contact: ..., // optional
  status: ..., // optional
  coordinator: ..., // optional
  serviceFrequency: ..., // optional
  assignees: ..., // optional
  chemistry: ..., // optional
  equipment: ..., // optional
  clientInfo: ..., // optional
};

// Call the `insertClientForOrgRef()` function to get a reference to the mutation.
const ref = insertClientForOrgRef(insertClientForOrgVars);
// Variables can be defined inline as well.
const ref = insertClientForOrgRef({ orgId: ..., clientId: ..., name: ..., nip: ..., city: ..., address: ..., contact: ..., status: ..., coordinator: ..., serviceFrequency: ..., assignees: ..., chemistry: ..., equipment: ..., clientInfo: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = insertClientForOrgRef(dataConnect, insertClientForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.client_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.client_insert);
});
```

## UpdateClientForOrg
You can execute the `UpdateClientForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
updateClientForOrg(vars: UpdateClientForOrgVariables): MutationPromise<UpdateClientForOrgData, UpdateClientForOrgVariables>;

interface UpdateClientForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateClientForOrgVariables): MutationRef<UpdateClientForOrgData, UpdateClientForOrgVariables>;
}
export const updateClientForOrgRef: UpdateClientForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
updateClientForOrg(dc: DataConnect, vars: UpdateClientForOrgVariables): MutationPromise<UpdateClientForOrgData, UpdateClientForOrgVariables>;

interface UpdateClientForOrgRef {
  ...
  (dc: DataConnect, vars: UpdateClientForOrgVariables): MutationRef<UpdateClientForOrgData, UpdateClientForOrgVariables>;
}
export const updateClientForOrgRef: UpdateClientForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the updateClientForOrgRef:
```typescript
const name = updateClientForOrgRef.operationName;
console.log(name);
```

### Variables
The `UpdateClientForOrg` mutation requires an argument of type `UpdateClientForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface UpdateClientForOrgVariables {
  orgId: string;
  clientId: string;
  name?: string | null;
  nip?: string | null;
  city?: string | null;
  address?: string | null;
  contact?: string | null;
  status?: string | null;
  coordinator?: string | null;
  serviceFrequency?: string | null;
  assignees?: string | null;
  chemistry?: string | null;
  equipment?: string | null;
  clientInfo?: string | null;
}
```
### Return Type
Recall that executing the `UpdateClientForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `UpdateClientForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface UpdateClientForOrgData {
  client_update?: Client_Key | null;
}
```
### Using `UpdateClientForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, updateClientForOrg, UpdateClientForOrgVariables } from '@dataconnect/generated';

// The `UpdateClientForOrg` mutation requires an argument of type `UpdateClientForOrgVariables`:
const updateClientForOrgVars: UpdateClientForOrgVariables = {
  orgId: ..., 
  clientId: ..., 
  name: ..., // optional
  nip: ..., // optional
  city: ..., // optional
  address: ..., // optional
  contact: ..., // optional
  status: ..., // optional
  coordinator: ..., // optional
  serviceFrequency: ..., // optional
  assignees: ..., // optional
  chemistry: ..., // optional
  equipment: ..., // optional
  clientInfo: ..., // optional
};

// Call the `updateClientForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await updateClientForOrg(updateClientForOrgVars);
// Variables can be defined inline as well.
const { data } = await updateClientForOrg({ orgId: ..., clientId: ..., name: ..., nip: ..., city: ..., address: ..., contact: ..., status: ..., coordinator: ..., serviceFrequency: ..., assignees: ..., chemistry: ..., equipment: ..., clientInfo: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await updateClientForOrg(dataConnect, updateClientForOrgVars);

console.log(data.client_update);

// Or, you can use the `Promise` API.
updateClientForOrg(updateClientForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.client_update);
});
```

### Using `UpdateClientForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, updateClientForOrgRef, UpdateClientForOrgVariables } from '@dataconnect/generated';

// The `UpdateClientForOrg` mutation requires an argument of type `UpdateClientForOrgVariables`:
const updateClientForOrgVars: UpdateClientForOrgVariables = {
  orgId: ..., 
  clientId: ..., 
  name: ..., // optional
  nip: ..., // optional
  city: ..., // optional
  address: ..., // optional
  contact: ..., // optional
  status: ..., // optional
  coordinator: ..., // optional
  serviceFrequency: ..., // optional
  assignees: ..., // optional
  chemistry: ..., // optional
  equipment: ..., // optional
  clientInfo: ..., // optional
};

// Call the `updateClientForOrgRef()` function to get a reference to the mutation.
const ref = updateClientForOrgRef(updateClientForOrgVars);
// Variables can be defined inline as well.
const ref = updateClientForOrgRef({ orgId: ..., clientId: ..., name: ..., nip: ..., city: ..., address: ..., contact: ..., status: ..., coordinator: ..., serviceFrequency: ..., assignees: ..., chemistry: ..., equipment: ..., clientInfo: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = updateClientForOrgRef(dataConnect, updateClientForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.client_update);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.client_update);
});
```

## DeleteClientForOrg
You can execute the `DeleteClientForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
deleteClientForOrg(vars: DeleteClientForOrgVariables): MutationPromise<DeleteClientForOrgData, DeleteClientForOrgVariables>;

interface DeleteClientForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: DeleteClientForOrgVariables): MutationRef<DeleteClientForOrgData, DeleteClientForOrgVariables>;
}
export const deleteClientForOrgRef: DeleteClientForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
deleteClientForOrg(dc: DataConnect, vars: DeleteClientForOrgVariables): MutationPromise<DeleteClientForOrgData, DeleteClientForOrgVariables>;

interface DeleteClientForOrgRef {
  ...
  (dc: DataConnect, vars: DeleteClientForOrgVariables): MutationRef<DeleteClientForOrgData, DeleteClientForOrgVariables>;
}
export const deleteClientForOrgRef: DeleteClientForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the deleteClientForOrgRef:
```typescript
const name = deleteClientForOrgRef.operationName;
console.log(name);
```

### Variables
The `DeleteClientForOrg` mutation requires an argument of type `DeleteClientForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface DeleteClientForOrgVariables {
  orgId: string;
  clientId: string;
}
```
### Return Type
Recall that executing the `DeleteClientForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `DeleteClientForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface DeleteClientForOrgData {
  client_delete?: Client_Key | null;
}
```
### Using `DeleteClientForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, deleteClientForOrg, DeleteClientForOrgVariables } from '@dataconnect/generated';

// The `DeleteClientForOrg` mutation requires an argument of type `DeleteClientForOrgVariables`:
const deleteClientForOrgVars: DeleteClientForOrgVariables = {
  orgId: ..., 
  clientId: ..., 
};

// Call the `deleteClientForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await deleteClientForOrg(deleteClientForOrgVars);
// Variables can be defined inline as well.
const { data } = await deleteClientForOrg({ orgId: ..., clientId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await deleteClientForOrg(dataConnect, deleteClientForOrgVars);

console.log(data.client_delete);

// Or, you can use the `Promise` API.
deleteClientForOrg(deleteClientForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.client_delete);
});
```

### Using `DeleteClientForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, deleteClientForOrgRef, DeleteClientForOrgVariables } from '@dataconnect/generated';

// The `DeleteClientForOrg` mutation requires an argument of type `DeleteClientForOrgVariables`:
const deleteClientForOrgVars: DeleteClientForOrgVariables = {
  orgId: ..., 
  clientId: ..., 
};

// Call the `deleteClientForOrgRef()` function to get a reference to the mutation.
const ref = deleteClientForOrgRef(deleteClientForOrgVars);
// Variables can be defined inline as well.
const ref = deleteClientForOrgRef({ orgId: ..., clientId: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = deleteClientForOrgRef(dataConnect, deleteClientForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.client_delete);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.client_delete);
});
```

## InsertIndividualJobForOrg
You can execute the `InsertIndividualJobForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
insertIndividualJobForOrg(vars: InsertIndividualJobForOrgVariables): MutationPromise<InsertIndividualJobForOrgData, InsertIndividualJobForOrgVariables>;

interface InsertIndividualJobForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: InsertIndividualJobForOrgVariables): MutationRef<InsertIndividualJobForOrgData, InsertIndividualJobForOrgVariables>;
}
export const insertIndividualJobForOrgRef: InsertIndividualJobForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
insertIndividualJobForOrg(dc: DataConnect, vars: InsertIndividualJobForOrgVariables): MutationPromise<InsertIndividualJobForOrgData, InsertIndividualJobForOrgVariables>;

interface InsertIndividualJobForOrgRef {
  ...
  (dc: DataConnect, vars: InsertIndividualJobForOrgVariables): MutationRef<InsertIndividualJobForOrgData, InsertIndividualJobForOrgVariables>;
}
export const insertIndividualJobForOrgRef: InsertIndividualJobForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the insertIndividualJobForOrgRef:
```typescript
const name = insertIndividualJobForOrgRef.operationName;
console.log(name);
```

### Variables
The `InsertIndividualJobForOrg` mutation requires an argument of type `InsertIndividualJobForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface InsertIndividualJobForOrgVariables {
  orgId: string;
  clientIndId: string;
  date?: TimestampString | null;
  name?: string | null;
  nip?: string | null;
  city?: string | null;
  address?: string | null;
  contact?: string | null;
  clientInfo?: string | null;
  qrCode?: string | null;
}
```
### Return Type
Recall that executing the `InsertIndividualJobForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `InsertIndividualJobForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface InsertIndividualJobForOrgData {
  individualClientJob_insert: IndividualClientJob_Key;
}
```
### Using `InsertIndividualJobForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, insertIndividualJobForOrg, InsertIndividualJobForOrgVariables } from '@dataconnect/generated';

// The `InsertIndividualJobForOrg` mutation requires an argument of type `InsertIndividualJobForOrgVariables`:
const insertIndividualJobForOrgVars: InsertIndividualJobForOrgVariables = {
  orgId: ..., 
  clientIndId: ..., 
  date: ..., // optional
  name: ..., // optional
  nip: ..., // optional
  city: ..., // optional
  address: ..., // optional
  contact: ..., // optional
  clientInfo: ..., // optional
  qrCode: ..., // optional
};

// Call the `insertIndividualJobForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await insertIndividualJobForOrg(insertIndividualJobForOrgVars);
// Variables can be defined inline as well.
const { data } = await insertIndividualJobForOrg({ orgId: ..., clientIndId: ..., date: ..., name: ..., nip: ..., city: ..., address: ..., contact: ..., clientInfo: ..., qrCode: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await insertIndividualJobForOrg(dataConnect, insertIndividualJobForOrgVars);

console.log(data.individualClientJob_insert);

// Or, you can use the `Promise` API.
insertIndividualJobForOrg(insertIndividualJobForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.individualClientJob_insert);
});
```

### Using `InsertIndividualJobForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, insertIndividualJobForOrgRef, InsertIndividualJobForOrgVariables } from '@dataconnect/generated';

// The `InsertIndividualJobForOrg` mutation requires an argument of type `InsertIndividualJobForOrgVariables`:
const insertIndividualJobForOrgVars: InsertIndividualJobForOrgVariables = {
  orgId: ..., 
  clientIndId: ..., 
  date: ..., // optional
  name: ..., // optional
  nip: ..., // optional
  city: ..., // optional
  address: ..., // optional
  contact: ..., // optional
  clientInfo: ..., // optional
  qrCode: ..., // optional
};

// Call the `insertIndividualJobForOrgRef()` function to get a reference to the mutation.
const ref = insertIndividualJobForOrgRef(insertIndividualJobForOrgVars);
// Variables can be defined inline as well.
const ref = insertIndividualJobForOrgRef({ orgId: ..., clientIndId: ..., date: ..., name: ..., nip: ..., city: ..., address: ..., contact: ..., clientInfo: ..., qrCode: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = insertIndividualJobForOrgRef(dataConnect, insertIndividualJobForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.individualClientJob_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.individualClientJob_insert);
});
```

## UpdateIndividualJobForOrg
You can execute the `UpdateIndividualJobForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
updateIndividualJobForOrg(vars: UpdateIndividualJobForOrgVariables): MutationPromise<UpdateIndividualJobForOrgData, UpdateIndividualJobForOrgVariables>;

interface UpdateIndividualJobForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateIndividualJobForOrgVariables): MutationRef<UpdateIndividualJobForOrgData, UpdateIndividualJobForOrgVariables>;
}
export const updateIndividualJobForOrgRef: UpdateIndividualJobForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
updateIndividualJobForOrg(dc: DataConnect, vars: UpdateIndividualJobForOrgVariables): MutationPromise<UpdateIndividualJobForOrgData, UpdateIndividualJobForOrgVariables>;

interface UpdateIndividualJobForOrgRef {
  ...
  (dc: DataConnect, vars: UpdateIndividualJobForOrgVariables): MutationRef<UpdateIndividualJobForOrgData, UpdateIndividualJobForOrgVariables>;
}
export const updateIndividualJobForOrgRef: UpdateIndividualJobForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the updateIndividualJobForOrgRef:
```typescript
const name = updateIndividualJobForOrgRef.operationName;
console.log(name);
```

### Variables
The `UpdateIndividualJobForOrg` mutation requires an argument of type `UpdateIndividualJobForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface UpdateIndividualJobForOrgVariables {
  orgId: string;
  clientIndId: string;
  date?: TimestampString | null;
  name?: string | null;
  nip?: string | null;
  city?: string | null;
  address?: string | null;
  contact?: string | null;
  clientInfo?: string | null;
  qrCode?: string | null;
}
```
### Return Type
Recall that executing the `UpdateIndividualJobForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `UpdateIndividualJobForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface UpdateIndividualJobForOrgData {
  individualClientJob_update?: IndividualClientJob_Key | null;
}
```
### Using `UpdateIndividualJobForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, updateIndividualJobForOrg, UpdateIndividualJobForOrgVariables } from '@dataconnect/generated';

// The `UpdateIndividualJobForOrg` mutation requires an argument of type `UpdateIndividualJobForOrgVariables`:
const updateIndividualJobForOrgVars: UpdateIndividualJobForOrgVariables = {
  orgId: ..., 
  clientIndId: ..., 
  date: ..., // optional
  name: ..., // optional
  nip: ..., // optional
  city: ..., // optional
  address: ..., // optional
  contact: ..., // optional
  clientInfo: ..., // optional
  qrCode: ..., // optional
};

// Call the `updateIndividualJobForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await updateIndividualJobForOrg(updateIndividualJobForOrgVars);
// Variables can be defined inline as well.
const { data } = await updateIndividualJobForOrg({ orgId: ..., clientIndId: ..., date: ..., name: ..., nip: ..., city: ..., address: ..., contact: ..., clientInfo: ..., qrCode: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await updateIndividualJobForOrg(dataConnect, updateIndividualJobForOrgVars);

console.log(data.individualClientJob_update);

// Or, you can use the `Promise` API.
updateIndividualJobForOrg(updateIndividualJobForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.individualClientJob_update);
});
```

### Using `UpdateIndividualJobForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, updateIndividualJobForOrgRef, UpdateIndividualJobForOrgVariables } from '@dataconnect/generated';

// The `UpdateIndividualJobForOrg` mutation requires an argument of type `UpdateIndividualJobForOrgVariables`:
const updateIndividualJobForOrgVars: UpdateIndividualJobForOrgVariables = {
  orgId: ..., 
  clientIndId: ..., 
  date: ..., // optional
  name: ..., // optional
  nip: ..., // optional
  city: ..., // optional
  address: ..., // optional
  contact: ..., // optional
  clientInfo: ..., // optional
  qrCode: ..., // optional
};

// Call the `updateIndividualJobForOrgRef()` function to get a reference to the mutation.
const ref = updateIndividualJobForOrgRef(updateIndividualJobForOrgVars);
// Variables can be defined inline as well.
const ref = updateIndividualJobForOrgRef({ orgId: ..., clientIndId: ..., date: ..., name: ..., nip: ..., city: ..., address: ..., contact: ..., clientInfo: ..., qrCode: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = updateIndividualJobForOrgRef(dataConnect, updateIndividualJobForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.individualClientJob_update);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.individualClientJob_update);
});
```

## DeleteIndividualJobForOrg
You can execute the `DeleteIndividualJobForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
deleteIndividualJobForOrg(vars: DeleteIndividualJobForOrgVariables): MutationPromise<DeleteIndividualJobForOrgData, DeleteIndividualJobForOrgVariables>;

interface DeleteIndividualJobForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: DeleteIndividualJobForOrgVariables): MutationRef<DeleteIndividualJobForOrgData, DeleteIndividualJobForOrgVariables>;
}
export const deleteIndividualJobForOrgRef: DeleteIndividualJobForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
deleteIndividualJobForOrg(dc: DataConnect, vars: DeleteIndividualJobForOrgVariables): MutationPromise<DeleteIndividualJobForOrgData, DeleteIndividualJobForOrgVariables>;

interface DeleteIndividualJobForOrgRef {
  ...
  (dc: DataConnect, vars: DeleteIndividualJobForOrgVariables): MutationRef<DeleteIndividualJobForOrgData, DeleteIndividualJobForOrgVariables>;
}
export const deleteIndividualJobForOrgRef: DeleteIndividualJobForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the deleteIndividualJobForOrgRef:
```typescript
const name = deleteIndividualJobForOrgRef.operationName;
console.log(name);
```

### Variables
The `DeleteIndividualJobForOrg` mutation requires an argument of type `DeleteIndividualJobForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface DeleteIndividualJobForOrgVariables {
  orgId: string;
  clientIndId: string;
}
```
### Return Type
Recall that executing the `DeleteIndividualJobForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `DeleteIndividualJobForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface DeleteIndividualJobForOrgData {
  individualClientJob_delete?: IndividualClientJob_Key | null;
}
```
### Using `DeleteIndividualJobForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, deleteIndividualJobForOrg, DeleteIndividualJobForOrgVariables } from '@dataconnect/generated';

// The `DeleteIndividualJobForOrg` mutation requires an argument of type `DeleteIndividualJobForOrgVariables`:
const deleteIndividualJobForOrgVars: DeleteIndividualJobForOrgVariables = {
  orgId: ..., 
  clientIndId: ..., 
};

// Call the `deleteIndividualJobForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await deleteIndividualJobForOrg(deleteIndividualJobForOrgVars);
// Variables can be defined inline as well.
const { data } = await deleteIndividualJobForOrg({ orgId: ..., clientIndId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await deleteIndividualJobForOrg(dataConnect, deleteIndividualJobForOrgVars);

console.log(data.individualClientJob_delete);

// Or, you can use the `Promise` API.
deleteIndividualJobForOrg(deleteIndividualJobForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.individualClientJob_delete);
});
```

### Using `DeleteIndividualJobForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, deleteIndividualJobForOrgRef, DeleteIndividualJobForOrgVariables } from '@dataconnect/generated';

// The `DeleteIndividualJobForOrg` mutation requires an argument of type `DeleteIndividualJobForOrgVariables`:
const deleteIndividualJobForOrgVars: DeleteIndividualJobForOrgVariables = {
  orgId: ..., 
  clientIndId: ..., 
};

// Call the `deleteIndividualJobForOrgRef()` function to get a reference to the mutation.
const ref = deleteIndividualJobForOrgRef(deleteIndividualJobForOrgVars);
// Variables can be defined inline as well.
const ref = deleteIndividualJobForOrgRef({ orgId: ..., clientIndId: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = deleteIndividualJobForOrgRef(dataConnect, deleteIndividualJobForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.individualClientJob_delete);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.individualClientJob_delete);
});
```

## InsertZoneForOrg
You can execute the `InsertZoneForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
insertZoneForOrg(vars: InsertZoneForOrgVariables): MutationPromise<InsertZoneForOrgData, InsertZoneForOrgVariables>;

interface InsertZoneForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: InsertZoneForOrgVariables): MutationRef<InsertZoneForOrgData, InsertZoneForOrgVariables>;
}
export const insertZoneForOrgRef: InsertZoneForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
insertZoneForOrg(dc: DataConnect, vars: InsertZoneForOrgVariables): MutationPromise<InsertZoneForOrgData, InsertZoneForOrgVariables>;

interface InsertZoneForOrgRef {
  ...
  (dc: DataConnect, vars: InsertZoneForOrgVariables): MutationRef<InsertZoneForOrgData, InsertZoneForOrgVariables>;
}
export const insertZoneForOrgRef: InsertZoneForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the insertZoneForOrgRef:
```typescript
const name = insertZoneForOrgRef.operationName;
console.log(name);
```

### Variables
The `InsertZoneForOrg` mutation requires an argument of type `InsertZoneForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface InsertZoneForOrgVariables {
  orgId: string;
  zoneId: string;
  clientId: string;
  zone?: string | null;
  function?: string | null;
  editedBy?: string | null;
  date?: TimestampString | null;
  location?: string | null;
}
```
### Return Type
Recall that executing the `InsertZoneForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `InsertZoneForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface InsertZoneForOrgData {
  zone_insert: Zone_Key;
}
```
### Using `InsertZoneForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, insertZoneForOrg, InsertZoneForOrgVariables } from '@dataconnect/generated';

// The `InsertZoneForOrg` mutation requires an argument of type `InsertZoneForOrgVariables`:
const insertZoneForOrgVars: InsertZoneForOrgVariables = {
  orgId: ..., 
  zoneId: ..., 
  clientId: ..., 
  zone: ..., // optional
  function: ..., // optional
  editedBy: ..., // optional
  date: ..., // optional
  location: ..., // optional
};

// Call the `insertZoneForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await insertZoneForOrg(insertZoneForOrgVars);
// Variables can be defined inline as well.
const { data } = await insertZoneForOrg({ orgId: ..., zoneId: ..., clientId: ..., zone: ..., function: ..., editedBy: ..., date: ..., location: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await insertZoneForOrg(dataConnect, insertZoneForOrgVars);

console.log(data.zone_insert);

// Or, you can use the `Promise` API.
insertZoneForOrg(insertZoneForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.zone_insert);
});
```

### Using `InsertZoneForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, insertZoneForOrgRef, InsertZoneForOrgVariables } from '@dataconnect/generated';

// The `InsertZoneForOrg` mutation requires an argument of type `InsertZoneForOrgVariables`:
const insertZoneForOrgVars: InsertZoneForOrgVariables = {
  orgId: ..., 
  zoneId: ..., 
  clientId: ..., 
  zone: ..., // optional
  function: ..., // optional
  editedBy: ..., // optional
  date: ..., // optional
  location: ..., // optional
};

// Call the `insertZoneForOrgRef()` function to get a reference to the mutation.
const ref = insertZoneForOrgRef(insertZoneForOrgVars);
// Variables can be defined inline as well.
const ref = insertZoneForOrgRef({ orgId: ..., zoneId: ..., clientId: ..., zone: ..., function: ..., editedBy: ..., date: ..., location: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = insertZoneForOrgRef(dataConnect, insertZoneForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.zone_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.zone_insert);
});
```

## UpdateZoneForOrg
You can execute the `UpdateZoneForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
updateZoneForOrg(vars: UpdateZoneForOrgVariables): MutationPromise<UpdateZoneForOrgData, UpdateZoneForOrgVariables>;

interface UpdateZoneForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateZoneForOrgVariables): MutationRef<UpdateZoneForOrgData, UpdateZoneForOrgVariables>;
}
export const updateZoneForOrgRef: UpdateZoneForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
updateZoneForOrg(dc: DataConnect, vars: UpdateZoneForOrgVariables): MutationPromise<UpdateZoneForOrgData, UpdateZoneForOrgVariables>;

interface UpdateZoneForOrgRef {
  ...
  (dc: DataConnect, vars: UpdateZoneForOrgVariables): MutationRef<UpdateZoneForOrgData, UpdateZoneForOrgVariables>;
}
export const updateZoneForOrgRef: UpdateZoneForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the updateZoneForOrgRef:
```typescript
const name = updateZoneForOrgRef.operationName;
console.log(name);
```

### Variables
The `UpdateZoneForOrg` mutation requires an argument of type `UpdateZoneForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface UpdateZoneForOrgVariables {
  orgId: string;
  zoneId: string;
  clientId: string;
  zone?: string | null;
  function?: string | null;
  editedBy?: string | null;
  date?: TimestampString | null;
  location?: string | null;
}
```
### Return Type
Recall that executing the `UpdateZoneForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `UpdateZoneForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface UpdateZoneForOrgData {
  zone_update?: Zone_Key | null;
}
```
### Using `UpdateZoneForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, updateZoneForOrg, UpdateZoneForOrgVariables } from '@dataconnect/generated';

// The `UpdateZoneForOrg` mutation requires an argument of type `UpdateZoneForOrgVariables`:
const updateZoneForOrgVars: UpdateZoneForOrgVariables = {
  orgId: ..., 
  zoneId: ..., 
  clientId: ..., 
  zone: ..., // optional
  function: ..., // optional
  editedBy: ..., // optional
  date: ..., // optional
  location: ..., // optional
};

// Call the `updateZoneForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await updateZoneForOrg(updateZoneForOrgVars);
// Variables can be defined inline as well.
const { data } = await updateZoneForOrg({ orgId: ..., zoneId: ..., clientId: ..., zone: ..., function: ..., editedBy: ..., date: ..., location: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await updateZoneForOrg(dataConnect, updateZoneForOrgVars);

console.log(data.zone_update);

// Or, you can use the `Promise` API.
updateZoneForOrg(updateZoneForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.zone_update);
});
```

### Using `UpdateZoneForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, updateZoneForOrgRef, UpdateZoneForOrgVariables } from '@dataconnect/generated';

// The `UpdateZoneForOrg` mutation requires an argument of type `UpdateZoneForOrgVariables`:
const updateZoneForOrgVars: UpdateZoneForOrgVariables = {
  orgId: ..., 
  zoneId: ..., 
  clientId: ..., 
  zone: ..., // optional
  function: ..., // optional
  editedBy: ..., // optional
  date: ..., // optional
  location: ..., // optional
};

// Call the `updateZoneForOrgRef()` function to get a reference to the mutation.
const ref = updateZoneForOrgRef(updateZoneForOrgVars);
// Variables can be defined inline as well.
const ref = updateZoneForOrgRef({ orgId: ..., zoneId: ..., clientId: ..., zone: ..., function: ..., editedBy: ..., date: ..., location: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = updateZoneForOrgRef(dataConnect, updateZoneForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.zone_update);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.zone_update);
});
```

## DeleteZoneForOrg
You can execute the `DeleteZoneForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
deleteZoneForOrg(vars: DeleteZoneForOrgVariables): MutationPromise<DeleteZoneForOrgData, DeleteZoneForOrgVariables>;

interface DeleteZoneForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: DeleteZoneForOrgVariables): MutationRef<DeleteZoneForOrgData, DeleteZoneForOrgVariables>;
}
export const deleteZoneForOrgRef: DeleteZoneForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
deleteZoneForOrg(dc: DataConnect, vars: DeleteZoneForOrgVariables): MutationPromise<DeleteZoneForOrgData, DeleteZoneForOrgVariables>;

interface DeleteZoneForOrgRef {
  ...
  (dc: DataConnect, vars: DeleteZoneForOrgVariables): MutationRef<DeleteZoneForOrgData, DeleteZoneForOrgVariables>;
}
export const deleteZoneForOrgRef: DeleteZoneForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the deleteZoneForOrgRef:
```typescript
const name = deleteZoneForOrgRef.operationName;
console.log(name);
```

### Variables
The `DeleteZoneForOrg` mutation requires an argument of type `DeleteZoneForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface DeleteZoneForOrgVariables {
  orgId: string;
  zoneId: string;
}
```
### Return Type
Recall that executing the `DeleteZoneForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `DeleteZoneForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface DeleteZoneForOrgData {
  zone_delete?: Zone_Key | null;
}
```
### Using `DeleteZoneForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, deleteZoneForOrg, DeleteZoneForOrgVariables } from '@dataconnect/generated';

// The `DeleteZoneForOrg` mutation requires an argument of type `DeleteZoneForOrgVariables`:
const deleteZoneForOrgVars: DeleteZoneForOrgVariables = {
  orgId: ..., 
  zoneId: ..., 
};

// Call the `deleteZoneForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await deleteZoneForOrg(deleteZoneForOrgVars);
// Variables can be defined inline as well.
const { data } = await deleteZoneForOrg({ orgId: ..., zoneId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await deleteZoneForOrg(dataConnect, deleteZoneForOrgVars);

console.log(data.zone_delete);

// Or, you can use the `Promise` API.
deleteZoneForOrg(deleteZoneForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.zone_delete);
});
```

### Using `DeleteZoneForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, deleteZoneForOrgRef, DeleteZoneForOrgVariables } from '@dataconnect/generated';

// The `DeleteZoneForOrg` mutation requires an argument of type `DeleteZoneForOrgVariables`:
const deleteZoneForOrgVars: DeleteZoneForOrgVariables = {
  orgId: ..., 
  zoneId: ..., 
};

// Call the `deleteZoneForOrgRef()` function to get a reference to the mutation.
const ref = deleteZoneForOrgRef(deleteZoneForOrgVars);
// Variables can be defined inline as well.
const ref = deleteZoneForOrgRef({ orgId: ..., zoneId: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = deleteZoneForOrgRef(dataConnect, deleteZoneForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.zone_delete);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.zone_delete);
});
```

## InsertWorkdayForOrg
You can execute the `InsertWorkdayForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
insertWorkdayForOrg(vars: InsertWorkdayForOrgVariables): MutationPromise<InsertWorkdayForOrgData, InsertWorkdayForOrgVariables>;

interface InsertWorkdayForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: InsertWorkdayForOrgVariables): MutationRef<InsertWorkdayForOrgData, InsertWorkdayForOrgVariables>;
}
export const insertWorkdayForOrgRef: InsertWorkdayForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
insertWorkdayForOrg(dc: DataConnect, vars: InsertWorkdayForOrgVariables): MutationPromise<InsertWorkdayForOrgData, InsertWorkdayForOrgVariables>;

interface InsertWorkdayForOrgRef {
  ...
  (dc: DataConnect, vars: InsertWorkdayForOrgVariables): MutationRef<InsertWorkdayForOrgData, InsertWorkdayForOrgVariables>;
}
export const insertWorkdayForOrgRef: InsertWorkdayForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the insertWorkdayForOrgRef:
```typescript
const name = insertWorkdayForOrgRef.operationName;
console.log(name);
```

### Variables
The `InsertWorkdayForOrg` mutation requires an argument of type `InsertWorkdayForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface InsertWorkdayForOrgVariables {
  orgId: string;
  workdayId: string;
  workerLogin: string;
  workerName?: string | null;
  utilityRoomId?: string | null;
  startAt?: TimestampString | null;
  endAt?: TimestampString | null;
  durationSec?: number | null;
  status?: string | null;
  gps?: string | null;
  comment?: string | null;
  updatedBy?: string | null;
}
```
### Return Type
Recall that executing the `InsertWorkdayForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `InsertWorkdayForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface InsertWorkdayForOrgData {
  workday_insert: Workday_Key;
}
```
### Using `InsertWorkdayForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, insertWorkdayForOrg, InsertWorkdayForOrgVariables } from '@dataconnect/generated';

// The `InsertWorkdayForOrg` mutation requires an argument of type `InsertWorkdayForOrgVariables`:
const insertWorkdayForOrgVars: InsertWorkdayForOrgVariables = {
  orgId: ..., 
  workdayId: ..., 
  workerLogin: ..., 
  workerName: ..., // optional
  utilityRoomId: ..., // optional
  startAt: ..., // optional
  endAt: ..., // optional
  durationSec: ..., // optional
  status: ..., // optional
  gps: ..., // optional
  comment: ..., // optional
  updatedBy: ..., // optional
};

// Call the `insertWorkdayForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await insertWorkdayForOrg(insertWorkdayForOrgVars);
// Variables can be defined inline as well.
const { data } = await insertWorkdayForOrg({ orgId: ..., workdayId: ..., workerLogin: ..., workerName: ..., utilityRoomId: ..., startAt: ..., endAt: ..., durationSec: ..., status: ..., gps: ..., comment: ..., updatedBy: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await insertWorkdayForOrg(dataConnect, insertWorkdayForOrgVars);

console.log(data.workday_insert);

// Or, you can use the `Promise` API.
insertWorkdayForOrg(insertWorkdayForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.workday_insert);
});
```

### Using `InsertWorkdayForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, insertWorkdayForOrgRef, InsertWorkdayForOrgVariables } from '@dataconnect/generated';

// The `InsertWorkdayForOrg` mutation requires an argument of type `InsertWorkdayForOrgVariables`:
const insertWorkdayForOrgVars: InsertWorkdayForOrgVariables = {
  orgId: ..., 
  workdayId: ..., 
  workerLogin: ..., 
  workerName: ..., // optional
  utilityRoomId: ..., // optional
  startAt: ..., // optional
  endAt: ..., // optional
  durationSec: ..., // optional
  status: ..., // optional
  gps: ..., // optional
  comment: ..., // optional
  updatedBy: ..., // optional
};

// Call the `insertWorkdayForOrgRef()` function to get a reference to the mutation.
const ref = insertWorkdayForOrgRef(insertWorkdayForOrgVars);
// Variables can be defined inline as well.
const ref = insertWorkdayForOrgRef({ orgId: ..., workdayId: ..., workerLogin: ..., workerName: ..., utilityRoomId: ..., startAt: ..., endAt: ..., durationSec: ..., status: ..., gps: ..., comment: ..., updatedBy: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = insertWorkdayForOrgRef(dataConnect, insertWorkdayForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.workday_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.workday_insert);
});
```

## UpdateWorkdayForOrg
You can execute the `UpdateWorkdayForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
updateWorkdayForOrg(vars: UpdateWorkdayForOrgVariables): MutationPromise<UpdateWorkdayForOrgData, UpdateWorkdayForOrgVariables>;

interface UpdateWorkdayForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateWorkdayForOrgVariables): MutationRef<UpdateWorkdayForOrgData, UpdateWorkdayForOrgVariables>;
}
export const updateWorkdayForOrgRef: UpdateWorkdayForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
updateWorkdayForOrg(dc: DataConnect, vars: UpdateWorkdayForOrgVariables): MutationPromise<UpdateWorkdayForOrgData, UpdateWorkdayForOrgVariables>;

interface UpdateWorkdayForOrgRef {
  ...
  (dc: DataConnect, vars: UpdateWorkdayForOrgVariables): MutationRef<UpdateWorkdayForOrgData, UpdateWorkdayForOrgVariables>;
}
export const updateWorkdayForOrgRef: UpdateWorkdayForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the updateWorkdayForOrgRef:
```typescript
const name = updateWorkdayForOrgRef.operationName;
console.log(name);
```

### Variables
The `UpdateWorkdayForOrg` mutation requires an argument of type `UpdateWorkdayForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface UpdateWorkdayForOrgVariables {
  orgId: string;
  workdayId: string;
  workerLogin: string;
  workerName?: string | null;
  utilityRoomId?: string | null;
  startAt?: TimestampString | null;
  endAt?: TimestampString | null;
  durationSec?: number | null;
  status?: string | null;
  gps?: string | null;
  comment?: string | null;
  updatedBy?: string | null;
}
```
### Return Type
Recall that executing the `UpdateWorkdayForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `UpdateWorkdayForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface UpdateWorkdayForOrgData {
  workday_update?: Workday_Key | null;
}
```
### Using `UpdateWorkdayForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, updateWorkdayForOrg, UpdateWorkdayForOrgVariables } from '@dataconnect/generated';

// The `UpdateWorkdayForOrg` mutation requires an argument of type `UpdateWorkdayForOrgVariables`:
const updateWorkdayForOrgVars: UpdateWorkdayForOrgVariables = {
  orgId: ..., 
  workdayId: ..., 
  workerLogin: ..., 
  workerName: ..., // optional
  utilityRoomId: ..., // optional
  startAt: ..., // optional
  endAt: ..., // optional
  durationSec: ..., // optional
  status: ..., // optional
  gps: ..., // optional
  comment: ..., // optional
  updatedBy: ..., // optional
};

// Call the `updateWorkdayForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await updateWorkdayForOrg(updateWorkdayForOrgVars);
// Variables can be defined inline as well.
const { data } = await updateWorkdayForOrg({ orgId: ..., workdayId: ..., workerLogin: ..., workerName: ..., utilityRoomId: ..., startAt: ..., endAt: ..., durationSec: ..., status: ..., gps: ..., comment: ..., updatedBy: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await updateWorkdayForOrg(dataConnect, updateWorkdayForOrgVars);

console.log(data.workday_update);

// Or, you can use the `Promise` API.
updateWorkdayForOrg(updateWorkdayForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.workday_update);
});
```

### Using `UpdateWorkdayForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, updateWorkdayForOrgRef, UpdateWorkdayForOrgVariables } from '@dataconnect/generated';

// The `UpdateWorkdayForOrg` mutation requires an argument of type `UpdateWorkdayForOrgVariables`:
const updateWorkdayForOrgVars: UpdateWorkdayForOrgVariables = {
  orgId: ..., 
  workdayId: ..., 
  workerLogin: ..., 
  workerName: ..., // optional
  utilityRoomId: ..., // optional
  startAt: ..., // optional
  endAt: ..., // optional
  durationSec: ..., // optional
  status: ..., // optional
  gps: ..., // optional
  comment: ..., // optional
  updatedBy: ..., // optional
};

// Call the `updateWorkdayForOrgRef()` function to get a reference to the mutation.
const ref = updateWorkdayForOrgRef(updateWorkdayForOrgVars);
// Variables can be defined inline as well.
const ref = updateWorkdayForOrgRef({ orgId: ..., workdayId: ..., workerLogin: ..., workerName: ..., utilityRoomId: ..., startAt: ..., endAt: ..., durationSec: ..., status: ..., gps: ..., comment: ..., updatedBy: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = updateWorkdayForOrgRef(dataConnect, updateWorkdayForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.workday_update);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.workday_update);
});
```

## DeleteWorkdayForOrg
You can execute the `DeleteWorkdayForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
deleteWorkdayForOrg(vars: DeleteWorkdayForOrgVariables): MutationPromise<DeleteWorkdayForOrgData, DeleteWorkdayForOrgVariables>;

interface DeleteWorkdayForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: DeleteWorkdayForOrgVariables): MutationRef<DeleteWorkdayForOrgData, DeleteWorkdayForOrgVariables>;
}
export const deleteWorkdayForOrgRef: DeleteWorkdayForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
deleteWorkdayForOrg(dc: DataConnect, vars: DeleteWorkdayForOrgVariables): MutationPromise<DeleteWorkdayForOrgData, DeleteWorkdayForOrgVariables>;

interface DeleteWorkdayForOrgRef {
  ...
  (dc: DataConnect, vars: DeleteWorkdayForOrgVariables): MutationRef<DeleteWorkdayForOrgData, DeleteWorkdayForOrgVariables>;
}
export const deleteWorkdayForOrgRef: DeleteWorkdayForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the deleteWorkdayForOrgRef:
```typescript
const name = deleteWorkdayForOrgRef.operationName;
console.log(name);
```

### Variables
The `DeleteWorkdayForOrg` mutation requires an argument of type `DeleteWorkdayForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface DeleteWorkdayForOrgVariables {
  orgId: string;
  workdayId: string;
}
```
### Return Type
Recall that executing the `DeleteWorkdayForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `DeleteWorkdayForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface DeleteWorkdayForOrgData {
  workday_delete?: Workday_Key | null;
}
```
### Using `DeleteWorkdayForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, deleteWorkdayForOrg, DeleteWorkdayForOrgVariables } from '@dataconnect/generated';

// The `DeleteWorkdayForOrg` mutation requires an argument of type `DeleteWorkdayForOrgVariables`:
const deleteWorkdayForOrgVars: DeleteWorkdayForOrgVariables = {
  orgId: ..., 
  workdayId: ..., 
};

// Call the `deleteWorkdayForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await deleteWorkdayForOrg(deleteWorkdayForOrgVars);
// Variables can be defined inline as well.
const { data } = await deleteWorkdayForOrg({ orgId: ..., workdayId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await deleteWorkdayForOrg(dataConnect, deleteWorkdayForOrgVars);

console.log(data.workday_delete);

// Or, you can use the `Promise` API.
deleteWorkdayForOrg(deleteWorkdayForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.workday_delete);
});
```

### Using `DeleteWorkdayForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, deleteWorkdayForOrgRef, DeleteWorkdayForOrgVariables } from '@dataconnect/generated';

// The `DeleteWorkdayForOrg` mutation requires an argument of type `DeleteWorkdayForOrgVariables`:
const deleteWorkdayForOrgVars: DeleteWorkdayForOrgVariables = {
  orgId: ..., 
  workdayId: ..., 
};

// Call the `deleteWorkdayForOrgRef()` function to get a reference to the mutation.
const ref = deleteWorkdayForOrgRef(deleteWorkdayForOrgVars);
// Variables can be defined inline as well.
const ref = deleteWorkdayForOrgRef({ orgId: ..., workdayId: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = deleteWorkdayForOrgRef(dataConnect, deleteWorkdayForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.workday_delete);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.workday_delete);
});
```

## InsertEventForOrg
You can execute the `InsertEventForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
insertEventForOrg(vars: InsertEventForOrgVariables): MutationPromise<InsertEventForOrgData, InsertEventForOrgVariables>;

interface InsertEventForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: InsertEventForOrgVariables): MutationRef<InsertEventForOrgData, InsertEventForOrgVariables>;
}
export const insertEventForOrgRef: InsertEventForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
insertEventForOrg(dc: DataConnect, vars: InsertEventForOrgVariables): MutationPromise<InsertEventForOrgData, InsertEventForOrgVariables>;

interface InsertEventForOrgRef {
  ...
  (dc: DataConnect, vars: InsertEventForOrgVariables): MutationRef<InsertEventForOrgData, InsertEventForOrgVariables>;
}
export const insertEventForOrgRef: InsertEventForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the insertEventForOrgRef:
```typescript
const name = insertEventForOrgRef.operationName;
console.log(name);
```

### Variables
The `InsertEventForOrg` mutation requires an argument of type `InsertEventForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface InsertEventForOrgVariables {
  orgId: string;
  eventId: string;
  workdayId?: string | null;
  zoneId?: string | null;
  workerLogin?: string | null;
  workerName?: string | null;
  startAt?: TimestampString | null;
  endAt?: TimestampString | null;
  durationSec?: number | null;
  status?: string | null;
  closeMarkedAt?: TimestampString | null;
  endReason?: string | null;
  comment?: string | null;
  deviceId?: string | null;
  startEventId?: string | null;
  endEventId?: string | null;
}
```
### Return Type
Recall that executing the `InsertEventForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `InsertEventForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface InsertEventForOrgData {
  event_insert: Event_Key;
}
```
### Using `InsertEventForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, insertEventForOrg, InsertEventForOrgVariables } from '@dataconnect/generated';

// The `InsertEventForOrg` mutation requires an argument of type `InsertEventForOrgVariables`:
const insertEventForOrgVars: InsertEventForOrgVariables = {
  orgId: ..., 
  eventId: ..., 
  workdayId: ..., // optional
  zoneId: ..., // optional
  workerLogin: ..., // optional
  workerName: ..., // optional
  startAt: ..., // optional
  endAt: ..., // optional
  durationSec: ..., // optional
  status: ..., // optional
  closeMarkedAt: ..., // optional
  endReason: ..., // optional
  comment: ..., // optional
  deviceId: ..., // optional
  startEventId: ..., // optional
  endEventId: ..., // optional
};

// Call the `insertEventForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await insertEventForOrg(insertEventForOrgVars);
// Variables can be defined inline as well.
const { data } = await insertEventForOrg({ orgId: ..., eventId: ..., workdayId: ..., zoneId: ..., workerLogin: ..., workerName: ..., startAt: ..., endAt: ..., durationSec: ..., status: ..., closeMarkedAt: ..., endReason: ..., comment: ..., deviceId: ..., startEventId: ..., endEventId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await insertEventForOrg(dataConnect, insertEventForOrgVars);

console.log(data.event_insert);

// Or, you can use the `Promise` API.
insertEventForOrg(insertEventForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.event_insert);
});
```

### Using `InsertEventForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, insertEventForOrgRef, InsertEventForOrgVariables } from '@dataconnect/generated';

// The `InsertEventForOrg` mutation requires an argument of type `InsertEventForOrgVariables`:
const insertEventForOrgVars: InsertEventForOrgVariables = {
  orgId: ..., 
  eventId: ..., 
  workdayId: ..., // optional
  zoneId: ..., // optional
  workerLogin: ..., // optional
  workerName: ..., // optional
  startAt: ..., // optional
  endAt: ..., // optional
  durationSec: ..., // optional
  status: ..., // optional
  closeMarkedAt: ..., // optional
  endReason: ..., // optional
  comment: ..., // optional
  deviceId: ..., // optional
  startEventId: ..., // optional
  endEventId: ..., // optional
};

// Call the `insertEventForOrgRef()` function to get a reference to the mutation.
const ref = insertEventForOrgRef(insertEventForOrgVars);
// Variables can be defined inline as well.
const ref = insertEventForOrgRef({ orgId: ..., eventId: ..., workdayId: ..., zoneId: ..., workerLogin: ..., workerName: ..., startAt: ..., endAt: ..., durationSec: ..., status: ..., closeMarkedAt: ..., endReason: ..., comment: ..., deviceId: ..., startEventId: ..., endEventId: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = insertEventForOrgRef(dataConnect, insertEventForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.event_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.event_insert);
});
```

## UpdateEventForOrg
You can execute the `UpdateEventForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
updateEventForOrg(vars: UpdateEventForOrgVariables): MutationPromise<UpdateEventForOrgData, UpdateEventForOrgVariables>;

interface UpdateEventForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateEventForOrgVariables): MutationRef<UpdateEventForOrgData, UpdateEventForOrgVariables>;
}
export const updateEventForOrgRef: UpdateEventForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
updateEventForOrg(dc: DataConnect, vars: UpdateEventForOrgVariables): MutationPromise<UpdateEventForOrgData, UpdateEventForOrgVariables>;

interface UpdateEventForOrgRef {
  ...
  (dc: DataConnect, vars: UpdateEventForOrgVariables): MutationRef<UpdateEventForOrgData, UpdateEventForOrgVariables>;
}
export const updateEventForOrgRef: UpdateEventForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the updateEventForOrgRef:
```typescript
const name = updateEventForOrgRef.operationName;
console.log(name);
```

### Variables
The `UpdateEventForOrg` mutation requires an argument of type `UpdateEventForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface UpdateEventForOrgVariables {
  orgId: string;
  eventId: string;
  workdayId?: string | null;
  zoneId?: string | null;
  workerLogin?: string | null;
  workerName?: string | null;
  startAt?: TimestampString | null;
  endAt?: TimestampString | null;
  durationSec?: number | null;
  status?: string | null;
  closeMarkedAt?: TimestampString | null;
  endReason?: string | null;
  comment?: string | null;
  deviceId?: string | null;
  startEventId?: string | null;
  endEventId?: string | null;
}
```
### Return Type
Recall that executing the `UpdateEventForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `UpdateEventForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface UpdateEventForOrgData {
  event_update?: Event_Key | null;
}
```
### Using `UpdateEventForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, updateEventForOrg, UpdateEventForOrgVariables } from '@dataconnect/generated';

// The `UpdateEventForOrg` mutation requires an argument of type `UpdateEventForOrgVariables`:
const updateEventForOrgVars: UpdateEventForOrgVariables = {
  orgId: ..., 
  eventId: ..., 
  workdayId: ..., // optional
  zoneId: ..., // optional
  workerLogin: ..., // optional
  workerName: ..., // optional
  startAt: ..., // optional
  endAt: ..., // optional
  durationSec: ..., // optional
  status: ..., // optional
  closeMarkedAt: ..., // optional
  endReason: ..., // optional
  comment: ..., // optional
  deviceId: ..., // optional
  startEventId: ..., // optional
  endEventId: ..., // optional
};

// Call the `updateEventForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await updateEventForOrg(updateEventForOrgVars);
// Variables can be defined inline as well.
const { data } = await updateEventForOrg({ orgId: ..., eventId: ..., workdayId: ..., zoneId: ..., workerLogin: ..., workerName: ..., startAt: ..., endAt: ..., durationSec: ..., status: ..., closeMarkedAt: ..., endReason: ..., comment: ..., deviceId: ..., startEventId: ..., endEventId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await updateEventForOrg(dataConnect, updateEventForOrgVars);

console.log(data.event_update);

// Or, you can use the `Promise` API.
updateEventForOrg(updateEventForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.event_update);
});
```

### Using `UpdateEventForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, updateEventForOrgRef, UpdateEventForOrgVariables } from '@dataconnect/generated';

// The `UpdateEventForOrg` mutation requires an argument of type `UpdateEventForOrgVariables`:
const updateEventForOrgVars: UpdateEventForOrgVariables = {
  orgId: ..., 
  eventId: ..., 
  workdayId: ..., // optional
  zoneId: ..., // optional
  workerLogin: ..., // optional
  workerName: ..., // optional
  startAt: ..., // optional
  endAt: ..., // optional
  durationSec: ..., // optional
  status: ..., // optional
  closeMarkedAt: ..., // optional
  endReason: ..., // optional
  comment: ..., // optional
  deviceId: ..., // optional
  startEventId: ..., // optional
  endEventId: ..., // optional
};

// Call the `updateEventForOrgRef()` function to get a reference to the mutation.
const ref = updateEventForOrgRef(updateEventForOrgVars);
// Variables can be defined inline as well.
const ref = updateEventForOrgRef({ orgId: ..., eventId: ..., workdayId: ..., zoneId: ..., workerLogin: ..., workerName: ..., startAt: ..., endAt: ..., durationSec: ..., status: ..., closeMarkedAt: ..., endReason: ..., comment: ..., deviceId: ..., startEventId: ..., endEventId: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = updateEventForOrgRef(dataConnect, updateEventForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.event_update);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.event_update);
});
```

## DeleteEventForOrg
You can execute the `DeleteEventForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
deleteEventForOrg(vars: DeleteEventForOrgVariables): MutationPromise<DeleteEventForOrgData, DeleteEventForOrgVariables>;

interface DeleteEventForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: DeleteEventForOrgVariables): MutationRef<DeleteEventForOrgData, DeleteEventForOrgVariables>;
}
export const deleteEventForOrgRef: DeleteEventForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
deleteEventForOrg(dc: DataConnect, vars: DeleteEventForOrgVariables): MutationPromise<DeleteEventForOrgData, DeleteEventForOrgVariables>;

interface DeleteEventForOrgRef {
  ...
  (dc: DataConnect, vars: DeleteEventForOrgVariables): MutationRef<DeleteEventForOrgData, DeleteEventForOrgVariables>;
}
export const deleteEventForOrgRef: DeleteEventForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the deleteEventForOrgRef:
```typescript
const name = deleteEventForOrgRef.operationName;
console.log(name);
```

### Variables
The `DeleteEventForOrg` mutation requires an argument of type `DeleteEventForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface DeleteEventForOrgVariables {
  orgId: string;
  eventId: string;
}
```
### Return Type
Recall that executing the `DeleteEventForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `DeleteEventForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface DeleteEventForOrgData {
  event_delete?: Event_Key | null;
}
```
### Using `DeleteEventForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, deleteEventForOrg, DeleteEventForOrgVariables } from '@dataconnect/generated';

// The `DeleteEventForOrg` mutation requires an argument of type `DeleteEventForOrgVariables`:
const deleteEventForOrgVars: DeleteEventForOrgVariables = {
  orgId: ..., 
  eventId: ..., 
};

// Call the `deleteEventForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await deleteEventForOrg(deleteEventForOrgVars);
// Variables can be defined inline as well.
const { data } = await deleteEventForOrg({ orgId: ..., eventId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await deleteEventForOrg(dataConnect, deleteEventForOrgVars);

console.log(data.event_delete);

// Or, you can use the `Promise` API.
deleteEventForOrg(deleteEventForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.event_delete);
});
```

### Using `DeleteEventForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, deleteEventForOrgRef, DeleteEventForOrgVariables } from '@dataconnect/generated';

// The `DeleteEventForOrg` mutation requires an argument of type `DeleteEventForOrgVariables`:
const deleteEventForOrgVars: DeleteEventForOrgVariables = {
  orgId: ..., 
  eventId: ..., 
};

// Call the `deleteEventForOrgRef()` function to get a reference to the mutation.
const ref = deleteEventForOrgRef(deleteEventForOrgVars);
// Variables can be defined inline as well.
const ref = deleteEventForOrgRef({ orgId: ..., eventId: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = deleteEventForOrgRef(dataConnect, deleteEventForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.event_delete);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.event_delete);
});
```

## InsertBackupCycleForOrg
You can execute the `InsertBackupCycleForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
insertBackupCycleForOrg(vars: InsertBackupCycleForOrgVariables): MutationPromise<InsertBackupCycleForOrgData, InsertBackupCycleForOrgVariables>;

interface InsertBackupCycleForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: InsertBackupCycleForOrgVariables): MutationRef<InsertBackupCycleForOrgData, InsertBackupCycleForOrgVariables>;
}
export const insertBackupCycleForOrgRef: InsertBackupCycleForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
insertBackupCycleForOrg(dc: DataConnect, vars: InsertBackupCycleForOrgVariables): MutationPromise<InsertBackupCycleForOrgData, InsertBackupCycleForOrgVariables>;

interface InsertBackupCycleForOrgRef {
  ...
  (dc: DataConnect, vars: InsertBackupCycleForOrgVariables): MutationRef<InsertBackupCycleForOrgData, InsertBackupCycleForOrgVariables>;
}
export const insertBackupCycleForOrgRef: InsertBackupCycleForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the insertBackupCycleForOrgRef:
```typescript
const name = insertBackupCycleForOrgRef.operationName;
console.log(name);
```

### Variables
The `InsertBackupCycleForOrg` mutation requires an argument of type `InsertBackupCycleForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface InsertBackupCycleForOrgVariables {
  orgId: string;
  cycleId: string;
  workerLogin?: string | null;
  workerName?: string | null;
  roomId?: string | null;
  strefa?: string | null;
  pomieszczenie?: string | null;
  startAt?: TimestampString | null;
  endAt?: TimestampString | null;
  durationSec?: number | null;
  endReason?: string | null;
  comment?: string | null;
  status?: string | null;
  closeMarkedAt?: TimestampString | null;
  deviceId?: string | null;
  startEventId?: string | null;
  endEventId?: string | null;
}
```
### Return Type
Recall that executing the `InsertBackupCycleForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `InsertBackupCycleForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface InsertBackupCycleForOrgData {
  backupCycle_insert: BackupCycle_Key;
}
```
### Using `InsertBackupCycleForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, insertBackupCycleForOrg, InsertBackupCycleForOrgVariables } from '@dataconnect/generated';

// The `InsertBackupCycleForOrg` mutation requires an argument of type `InsertBackupCycleForOrgVariables`:
const insertBackupCycleForOrgVars: InsertBackupCycleForOrgVariables = {
  orgId: ..., 
  cycleId: ..., 
  workerLogin: ..., // optional
  workerName: ..., // optional
  roomId: ..., // optional
  strefa: ..., // optional
  pomieszczenie: ..., // optional
  startAt: ..., // optional
  endAt: ..., // optional
  durationSec: ..., // optional
  endReason: ..., // optional
  comment: ..., // optional
  status: ..., // optional
  closeMarkedAt: ..., // optional
  deviceId: ..., // optional
  startEventId: ..., // optional
  endEventId: ..., // optional
};

// Call the `insertBackupCycleForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await insertBackupCycleForOrg(insertBackupCycleForOrgVars);
// Variables can be defined inline as well.
const { data } = await insertBackupCycleForOrg({ orgId: ..., cycleId: ..., workerLogin: ..., workerName: ..., roomId: ..., strefa: ..., pomieszczenie: ..., startAt: ..., endAt: ..., durationSec: ..., endReason: ..., comment: ..., status: ..., closeMarkedAt: ..., deviceId: ..., startEventId: ..., endEventId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await insertBackupCycleForOrg(dataConnect, insertBackupCycleForOrgVars);

console.log(data.backupCycle_insert);

// Or, you can use the `Promise` API.
insertBackupCycleForOrg(insertBackupCycleForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.backupCycle_insert);
});
```

### Using `InsertBackupCycleForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, insertBackupCycleForOrgRef, InsertBackupCycleForOrgVariables } from '@dataconnect/generated';

// The `InsertBackupCycleForOrg` mutation requires an argument of type `InsertBackupCycleForOrgVariables`:
const insertBackupCycleForOrgVars: InsertBackupCycleForOrgVariables = {
  orgId: ..., 
  cycleId: ..., 
  workerLogin: ..., // optional
  workerName: ..., // optional
  roomId: ..., // optional
  strefa: ..., // optional
  pomieszczenie: ..., // optional
  startAt: ..., // optional
  endAt: ..., // optional
  durationSec: ..., // optional
  endReason: ..., // optional
  comment: ..., // optional
  status: ..., // optional
  closeMarkedAt: ..., // optional
  deviceId: ..., // optional
  startEventId: ..., // optional
  endEventId: ..., // optional
};

// Call the `insertBackupCycleForOrgRef()` function to get a reference to the mutation.
const ref = insertBackupCycleForOrgRef(insertBackupCycleForOrgVars);
// Variables can be defined inline as well.
const ref = insertBackupCycleForOrgRef({ orgId: ..., cycleId: ..., workerLogin: ..., workerName: ..., roomId: ..., strefa: ..., pomieszczenie: ..., startAt: ..., endAt: ..., durationSec: ..., endReason: ..., comment: ..., status: ..., closeMarkedAt: ..., deviceId: ..., startEventId: ..., endEventId: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = insertBackupCycleForOrgRef(dataConnect, insertBackupCycleForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.backupCycle_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.backupCycle_insert);
});
```

## UpdateBackupCycleForOrg
You can execute the `UpdateBackupCycleForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
updateBackupCycleForOrg(vars: UpdateBackupCycleForOrgVariables): MutationPromise<UpdateBackupCycleForOrgData, UpdateBackupCycleForOrgVariables>;

interface UpdateBackupCycleForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateBackupCycleForOrgVariables): MutationRef<UpdateBackupCycleForOrgData, UpdateBackupCycleForOrgVariables>;
}
export const updateBackupCycleForOrgRef: UpdateBackupCycleForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
updateBackupCycleForOrg(dc: DataConnect, vars: UpdateBackupCycleForOrgVariables): MutationPromise<UpdateBackupCycleForOrgData, UpdateBackupCycleForOrgVariables>;

interface UpdateBackupCycleForOrgRef {
  ...
  (dc: DataConnect, vars: UpdateBackupCycleForOrgVariables): MutationRef<UpdateBackupCycleForOrgData, UpdateBackupCycleForOrgVariables>;
}
export const updateBackupCycleForOrgRef: UpdateBackupCycleForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the updateBackupCycleForOrgRef:
```typescript
const name = updateBackupCycleForOrgRef.operationName;
console.log(name);
```

### Variables
The `UpdateBackupCycleForOrg` mutation requires an argument of type `UpdateBackupCycleForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface UpdateBackupCycleForOrgVariables {
  orgId: string;
  cycleId: string;
  workerLogin?: string | null;
  workerName?: string | null;
  roomId?: string | null;
  strefa?: string | null;
  pomieszczenie?: string | null;
  startAt?: TimestampString | null;
  endAt?: TimestampString | null;
  durationSec?: number | null;
  endReason?: string | null;
  comment?: string | null;
  status?: string | null;
  closeMarkedAt?: TimestampString | null;
  deviceId?: string | null;
  startEventId?: string | null;
  endEventId?: string | null;
}
```
### Return Type
Recall that executing the `UpdateBackupCycleForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `UpdateBackupCycleForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface UpdateBackupCycleForOrgData {
  backupCycle_update?: BackupCycle_Key | null;
}
```
### Using `UpdateBackupCycleForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, updateBackupCycleForOrg, UpdateBackupCycleForOrgVariables } from '@dataconnect/generated';

// The `UpdateBackupCycleForOrg` mutation requires an argument of type `UpdateBackupCycleForOrgVariables`:
const updateBackupCycleForOrgVars: UpdateBackupCycleForOrgVariables = {
  orgId: ..., 
  cycleId: ..., 
  workerLogin: ..., // optional
  workerName: ..., // optional
  roomId: ..., // optional
  strefa: ..., // optional
  pomieszczenie: ..., // optional
  startAt: ..., // optional
  endAt: ..., // optional
  durationSec: ..., // optional
  endReason: ..., // optional
  comment: ..., // optional
  status: ..., // optional
  closeMarkedAt: ..., // optional
  deviceId: ..., // optional
  startEventId: ..., // optional
  endEventId: ..., // optional
};

// Call the `updateBackupCycleForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await updateBackupCycleForOrg(updateBackupCycleForOrgVars);
// Variables can be defined inline as well.
const { data } = await updateBackupCycleForOrg({ orgId: ..., cycleId: ..., workerLogin: ..., workerName: ..., roomId: ..., strefa: ..., pomieszczenie: ..., startAt: ..., endAt: ..., durationSec: ..., endReason: ..., comment: ..., status: ..., closeMarkedAt: ..., deviceId: ..., startEventId: ..., endEventId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await updateBackupCycleForOrg(dataConnect, updateBackupCycleForOrgVars);

console.log(data.backupCycle_update);

// Or, you can use the `Promise` API.
updateBackupCycleForOrg(updateBackupCycleForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.backupCycle_update);
});
```

### Using `UpdateBackupCycleForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, updateBackupCycleForOrgRef, UpdateBackupCycleForOrgVariables } from '@dataconnect/generated';

// The `UpdateBackupCycleForOrg` mutation requires an argument of type `UpdateBackupCycleForOrgVariables`:
const updateBackupCycleForOrgVars: UpdateBackupCycleForOrgVariables = {
  orgId: ..., 
  cycleId: ..., 
  workerLogin: ..., // optional
  workerName: ..., // optional
  roomId: ..., // optional
  strefa: ..., // optional
  pomieszczenie: ..., // optional
  startAt: ..., // optional
  endAt: ..., // optional
  durationSec: ..., // optional
  endReason: ..., // optional
  comment: ..., // optional
  status: ..., // optional
  closeMarkedAt: ..., // optional
  deviceId: ..., // optional
  startEventId: ..., // optional
  endEventId: ..., // optional
};

// Call the `updateBackupCycleForOrgRef()` function to get a reference to the mutation.
const ref = updateBackupCycleForOrgRef(updateBackupCycleForOrgVars);
// Variables can be defined inline as well.
const ref = updateBackupCycleForOrgRef({ orgId: ..., cycleId: ..., workerLogin: ..., workerName: ..., roomId: ..., strefa: ..., pomieszczenie: ..., startAt: ..., endAt: ..., durationSec: ..., endReason: ..., comment: ..., status: ..., closeMarkedAt: ..., deviceId: ..., startEventId: ..., endEventId: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = updateBackupCycleForOrgRef(dataConnect, updateBackupCycleForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.backupCycle_update);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.backupCycle_update);
});
```

## InsertStorageForOrg
You can execute the `InsertStorageForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
insertStorageForOrg(vars: InsertStorageForOrgVariables): MutationPromise<InsertStorageForOrgData, InsertStorageForOrgVariables>;

interface InsertStorageForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: InsertStorageForOrgVariables): MutationRef<InsertStorageForOrgData, InsertStorageForOrgVariables>;
}
export const insertStorageForOrgRef: InsertStorageForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
insertStorageForOrg(dc: DataConnect, vars: InsertStorageForOrgVariables): MutationPromise<InsertStorageForOrgData, InsertStorageForOrgVariables>;

interface InsertStorageForOrgRef {
  ...
  (dc: DataConnect, vars: InsertStorageForOrgVariables): MutationRef<InsertStorageForOrgData, InsertStorageForOrgVariables>;
}
export const insertStorageForOrgRef: InsertStorageForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the insertStorageForOrgRef:
```typescript
const name = insertStorageForOrgRef.operationName;
console.log(name);
```

### Variables
The `InsertStorageForOrg` mutation requires an argument of type `InsertStorageForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface InsertStorageForOrgVariables {
  orgId: string;
  productIndex: string;
  productId: string;
  name: string;
  productType: string;
  quantity?: number | null;
  quantityMin?: number | null;
  quantityMax?: number | null;
  description?: string | null;
  qrCode?: string | null;
}
```
### Return Type
Recall that executing the `InsertStorageForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `InsertStorageForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface InsertStorageForOrgData {
  storage_insert: Storage_Key;
}
```
### Using `InsertStorageForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, insertStorageForOrg, InsertStorageForOrgVariables } from '@dataconnect/generated';

// The `InsertStorageForOrg` mutation requires an argument of type `InsertStorageForOrgVariables`:
const insertStorageForOrgVars: InsertStorageForOrgVariables = {
  orgId: ..., 
  productIndex: ..., 
  productId: ..., 
  name: ..., 
  productType: ..., 
  quantity: ..., // optional
  quantityMin: ..., // optional
  quantityMax: ..., // optional
  description: ..., // optional
  qrCode: ..., // optional
};

// Call the `insertStorageForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await insertStorageForOrg(insertStorageForOrgVars);
// Variables can be defined inline as well.
const { data } = await insertStorageForOrg({ orgId: ..., productIndex: ..., productId: ..., name: ..., productType: ..., quantity: ..., quantityMin: ..., quantityMax: ..., description: ..., qrCode: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await insertStorageForOrg(dataConnect, insertStorageForOrgVars);

console.log(data.storage_insert);

// Or, you can use the `Promise` API.
insertStorageForOrg(insertStorageForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.storage_insert);
});
```

### Using `InsertStorageForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, insertStorageForOrgRef, InsertStorageForOrgVariables } from '@dataconnect/generated';

// The `InsertStorageForOrg` mutation requires an argument of type `InsertStorageForOrgVariables`:
const insertStorageForOrgVars: InsertStorageForOrgVariables = {
  orgId: ..., 
  productIndex: ..., 
  productId: ..., 
  name: ..., 
  productType: ..., 
  quantity: ..., // optional
  quantityMin: ..., // optional
  quantityMax: ..., // optional
  description: ..., // optional
  qrCode: ..., // optional
};

// Call the `insertStorageForOrgRef()` function to get a reference to the mutation.
const ref = insertStorageForOrgRef(insertStorageForOrgVars);
// Variables can be defined inline as well.
const ref = insertStorageForOrgRef({ orgId: ..., productIndex: ..., productId: ..., name: ..., productType: ..., quantity: ..., quantityMin: ..., quantityMax: ..., description: ..., qrCode: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = insertStorageForOrgRef(dataConnect, insertStorageForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.storage_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.storage_insert);
});
```

## UpdateStorageForOrg
You can execute the `UpdateStorageForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
updateStorageForOrg(vars: UpdateStorageForOrgVariables): MutationPromise<UpdateStorageForOrgData, UpdateStorageForOrgVariables>;

interface UpdateStorageForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateStorageForOrgVariables): MutationRef<UpdateStorageForOrgData, UpdateStorageForOrgVariables>;
}
export const updateStorageForOrgRef: UpdateStorageForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
updateStorageForOrg(dc: DataConnect, vars: UpdateStorageForOrgVariables): MutationPromise<UpdateStorageForOrgData, UpdateStorageForOrgVariables>;

interface UpdateStorageForOrgRef {
  ...
  (dc: DataConnect, vars: UpdateStorageForOrgVariables): MutationRef<UpdateStorageForOrgData, UpdateStorageForOrgVariables>;
}
export const updateStorageForOrgRef: UpdateStorageForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the updateStorageForOrgRef:
```typescript
const name = updateStorageForOrgRef.operationName;
console.log(name);
```

### Variables
The `UpdateStorageForOrg` mutation requires an argument of type `UpdateStorageForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface UpdateStorageForOrgVariables {
  orgId: string;
  productIndex: string;
  productId?: string | null;
  name?: string | null;
  productType?: string | null;
  quantity?: number | null;
  quantityMin?: number | null;
  quantityMax?: number | null;
  description?: string | null;
  qrCode?: string | null;
}
```
### Return Type
Recall that executing the `UpdateStorageForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `UpdateStorageForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface UpdateStorageForOrgData {
  storage_update?: Storage_Key | null;
}
```
### Using `UpdateStorageForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, updateStorageForOrg, UpdateStorageForOrgVariables } from '@dataconnect/generated';

// The `UpdateStorageForOrg` mutation requires an argument of type `UpdateStorageForOrgVariables`:
const updateStorageForOrgVars: UpdateStorageForOrgVariables = {
  orgId: ..., 
  productIndex: ..., 
  productId: ..., // optional
  name: ..., // optional
  productType: ..., // optional
  quantity: ..., // optional
  quantityMin: ..., // optional
  quantityMax: ..., // optional
  description: ..., // optional
  qrCode: ..., // optional
};

// Call the `updateStorageForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await updateStorageForOrg(updateStorageForOrgVars);
// Variables can be defined inline as well.
const { data } = await updateStorageForOrg({ orgId: ..., productIndex: ..., productId: ..., name: ..., productType: ..., quantity: ..., quantityMin: ..., quantityMax: ..., description: ..., qrCode: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await updateStorageForOrg(dataConnect, updateStorageForOrgVars);

console.log(data.storage_update);

// Or, you can use the `Promise` API.
updateStorageForOrg(updateStorageForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.storage_update);
});
```

### Using `UpdateStorageForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, updateStorageForOrgRef, UpdateStorageForOrgVariables } from '@dataconnect/generated';

// The `UpdateStorageForOrg` mutation requires an argument of type `UpdateStorageForOrgVariables`:
const updateStorageForOrgVars: UpdateStorageForOrgVariables = {
  orgId: ..., 
  productIndex: ..., 
  productId: ..., // optional
  name: ..., // optional
  productType: ..., // optional
  quantity: ..., // optional
  quantityMin: ..., // optional
  quantityMax: ..., // optional
  description: ..., // optional
  qrCode: ..., // optional
};

// Call the `updateStorageForOrgRef()` function to get a reference to the mutation.
const ref = updateStorageForOrgRef(updateStorageForOrgVars);
// Variables can be defined inline as well.
const ref = updateStorageForOrgRef({ orgId: ..., productIndex: ..., productId: ..., name: ..., productType: ..., quantity: ..., quantityMin: ..., quantityMax: ..., description: ..., qrCode: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = updateStorageForOrgRef(dataConnect, updateStorageForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.storage_update);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.storage_update);
});
```

## DeleteStorageForOrg
You can execute the `DeleteStorageForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
deleteStorageForOrg(vars: DeleteStorageForOrgVariables): MutationPromise<DeleteStorageForOrgData, DeleteStorageForOrgVariables>;

interface DeleteStorageForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: DeleteStorageForOrgVariables): MutationRef<DeleteStorageForOrgData, DeleteStorageForOrgVariables>;
}
export const deleteStorageForOrgRef: DeleteStorageForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
deleteStorageForOrg(dc: DataConnect, vars: DeleteStorageForOrgVariables): MutationPromise<DeleteStorageForOrgData, DeleteStorageForOrgVariables>;

interface DeleteStorageForOrgRef {
  ...
  (dc: DataConnect, vars: DeleteStorageForOrgVariables): MutationRef<DeleteStorageForOrgData, DeleteStorageForOrgVariables>;
}
export const deleteStorageForOrgRef: DeleteStorageForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the deleteStorageForOrgRef:
```typescript
const name = deleteStorageForOrgRef.operationName;
console.log(name);
```

### Variables
The `DeleteStorageForOrg` mutation requires an argument of type `DeleteStorageForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface DeleteStorageForOrgVariables {
  orgId: string;
  productIndex: string;
}
```
### Return Type
Recall that executing the `DeleteStorageForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `DeleteStorageForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface DeleteStorageForOrgData {
  storage_delete?: Storage_Key | null;
}
```
### Using `DeleteStorageForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, deleteStorageForOrg, DeleteStorageForOrgVariables } from '@dataconnect/generated';

// The `DeleteStorageForOrg` mutation requires an argument of type `DeleteStorageForOrgVariables`:
const deleteStorageForOrgVars: DeleteStorageForOrgVariables = {
  orgId: ..., 
  productIndex: ..., 
};

// Call the `deleteStorageForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await deleteStorageForOrg(deleteStorageForOrgVars);
// Variables can be defined inline as well.
const { data } = await deleteStorageForOrg({ orgId: ..., productIndex: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await deleteStorageForOrg(dataConnect, deleteStorageForOrgVars);

console.log(data.storage_delete);

// Or, you can use the `Promise` API.
deleteStorageForOrg(deleteStorageForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.storage_delete);
});
```

### Using `DeleteStorageForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, deleteStorageForOrgRef, DeleteStorageForOrgVariables } from '@dataconnect/generated';

// The `DeleteStorageForOrg` mutation requires an argument of type `DeleteStorageForOrgVariables`:
const deleteStorageForOrgVars: DeleteStorageForOrgVariables = {
  orgId: ..., 
  productIndex: ..., 
};

// Call the `deleteStorageForOrgRef()` function to get a reference to the mutation.
const ref = deleteStorageForOrgRef(deleteStorageForOrgVars);
// Variables can be defined inline as well.
const ref = deleteStorageForOrgRef({ orgId: ..., productIndex: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = deleteStorageForOrgRef(dataConnect, deleteStorageForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.storage_delete);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.storage_delete);
});
```

## InsertClientStorageForOrg
You can execute the `InsertClientStorageForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
insertClientStorageForOrg(vars: InsertClientStorageForOrgVariables): MutationPromise<InsertClientStorageForOrgData, InsertClientStorageForOrgVariables>;

interface InsertClientStorageForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: InsertClientStorageForOrgVariables): MutationRef<InsertClientStorageForOrgData, InsertClientStorageForOrgVariables>;
}
export const insertClientStorageForOrgRef: InsertClientStorageForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
insertClientStorageForOrg(dc: DataConnect, vars: InsertClientStorageForOrgVariables): MutationPromise<InsertClientStorageForOrgData, InsertClientStorageForOrgVariables>;

interface InsertClientStorageForOrgRef {
  ...
  (dc: DataConnect, vars: InsertClientStorageForOrgVariables): MutationRef<InsertClientStorageForOrgData, InsertClientStorageForOrgVariables>;
}
export const insertClientStorageForOrgRef: InsertClientStorageForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the insertClientStorageForOrgRef:
```typescript
const name = insertClientStorageForOrgRef.operationName;
console.log(name);
```

### Variables
The `InsertClientStorageForOrg` mutation requires an argument of type `InsertClientStorageForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface InsertClientStorageForOrgVariables {
  orgId: string;
  clientId: string;
  productIndex: string;
  name: string;
  productType: string;
  quantity?: number | null;
  quantityMin?: number | null;
  quantityMax?: number | null;
  qrCode?: string | null;
}
```
### Return Type
Recall that executing the `InsertClientStorageForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `InsertClientStorageForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface InsertClientStorageForOrgData {
  clientStorage_insert: ClientStorage_Key;
}
```
### Using `InsertClientStorageForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, insertClientStorageForOrg, InsertClientStorageForOrgVariables } from '@dataconnect/generated';

// The `InsertClientStorageForOrg` mutation requires an argument of type `InsertClientStorageForOrgVariables`:
const insertClientStorageForOrgVars: InsertClientStorageForOrgVariables = {
  orgId: ..., 
  clientId: ..., 
  productIndex: ..., 
  name: ..., 
  productType: ..., 
  quantity: ..., // optional
  quantityMin: ..., // optional
  quantityMax: ..., // optional
  qrCode: ..., // optional
};

// Call the `insertClientStorageForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await insertClientStorageForOrg(insertClientStorageForOrgVars);
// Variables can be defined inline as well.
const { data } = await insertClientStorageForOrg({ orgId: ..., clientId: ..., productIndex: ..., name: ..., productType: ..., quantity: ..., quantityMin: ..., quantityMax: ..., qrCode: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await insertClientStorageForOrg(dataConnect, insertClientStorageForOrgVars);

console.log(data.clientStorage_insert);

// Or, you can use the `Promise` API.
insertClientStorageForOrg(insertClientStorageForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.clientStorage_insert);
});
```

### Using `InsertClientStorageForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, insertClientStorageForOrgRef, InsertClientStorageForOrgVariables } from '@dataconnect/generated';

// The `InsertClientStorageForOrg` mutation requires an argument of type `InsertClientStorageForOrgVariables`:
const insertClientStorageForOrgVars: InsertClientStorageForOrgVariables = {
  orgId: ..., 
  clientId: ..., 
  productIndex: ..., 
  name: ..., 
  productType: ..., 
  quantity: ..., // optional
  quantityMin: ..., // optional
  quantityMax: ..., // optional
  qrCode: ..., // optional
};

// Call the `insertClientStorageForOrgRef()` function to get a reference to the mutation.
const ref = insertClientStorageForOrgRef(insertClientStorageForOrgVars);
// Variables can be defined inline as well.
const ref = insertClientStorageForOrgRef({ orgId: ..., clientId: ..., productIndex: ..., name: ..., productType: ..., quantity: ..., quantityMin: ..., quantityMax: ..., qrCode: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = insertClientStorageForOrgRef(dataConnect, insertClientStorageForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.clientStorage_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.clientStorage_insert);
});
```

## UpdateClientStorageForOrg
You can execute the `UpdateClientStorageForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
updateClientStorageForOrg(vars: UpdateClientStorageForOrgVariables): MutationPromise<UpdateClientStorageForOrgData, UpdateClientStorageForOrgVariables>;

interface UpdateClientStorageForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateClientStorageForOrgVariables): MutationRef<UpdateClientStorageForOrgData, UpdateClientStorageForOrgVariables>;
}
export const updateClientStorageForOrgRef: UpdateClientStorageForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
updateClientStorageForOrg(dc: DataConnect, vars: UpdateClientStorageForOrgVariables): MutationPromise<UpdateClientStorageForOrgData, UpdateClientStorageForOrgVariables>;

interface UpdateClientStorageForOrgRef {
  ...
  (dc: DataConnect, vars: UpdateClientStorageForOrgVariables): MutationRef<UpdateClientStorageForOrgData, UpdateClientStorageForOrgVariables>;
}
export const updateClientStorageForOrgRef: UpdateClientStorageForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the updateClientStorageForOrgRef:
```typescript
const name = updateClientStorageForOrgRef.operationName;
console.log(name);
```

### Variables
The `UpdateClientStorageForOrg` mutation requires an argument of type `UpdateClientStorageForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface UpdateClientStorageForOrgVariables {
  orgId: string;
  clientId: string;
  productIndex: string;
  name?: string | null;
  productType?: string | null;
  quantity?: number | null;
  quantityMin?: number | null;
  quantityMax?: number | null;
  qrCode?: string | null;
}
```
### Return Type
Recall that executing the `UpdateClientStorageForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `UpdateClientStorageForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface UpdateClientStorageForOrgData {
  clientStorage_update?: ClientStorage_Key | null;
}
```
### Using `UpdateClientStorageForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, updateClientStorageForOrg, UpdateClientStorageForOrgVariables } from '@dataconnect/generated';

// The `UpdateClientStorageForOrg` mutation requires an argument of type `UpdateClientStorageForOrgVariables`:
const updateClientStorageForOrgVars: UpdateClientStorageForOrgVariables = {
  orgId: ..., 
  clientId: ..., 
  productIndex: ..., 
  name: ..., // optional
  productType: ..., // optional
  quantity: ..., // optional
  quantityMin: ..., // optional
  quantityMax: ..., // optional
  qrCode: ..., // optional
};

// Call the `updateClientStorageForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await updateClientStorageForOrg(updateClientStorageForOrgVars);
// Variables can be defined inline as well.
const { data } = await updateClientStorageForOrg({ orgId: ..., clientId: ..., productIndex: ..., name: ..., productType: ..., quantity: ..., quantityMin: ..., quantityMax: ..., qrCode: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await updateClientStorageForOrg(dataConnect, updateClientStorageForOrgVars);

console.log(data.clientStorage_update);

// Or, you can use the `Promise` API.
updateClientStorageForOrg(updateClientStorageForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.clientStorage_update);
});
```

### Using `UpdateClientStorageForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, updateClientStorageForOrgRef, UpdateClientStorageForOrgVariables } from '@dataconnect/generated';

// The `UpdateClientStorageForOrg` mutation requires an argument of type `UpdateClientStorageForOrgVariables`:
const updateClientStorageForOrgVars: UpdateClientStorageForOrgVariables = {
  orgId: ..., 
  clientId: ..., 
  productIndex: ..., 
  name: ..., // optional
  productType: ..., // optional
  quantity: ..., // optional
  quantityMin: ..., // optional
  quantityMax: ..., // optional
  qrCode: ..., // optional
};

// Call the `updateClientStorageForOrgRef()` function to get a reference to the mutation.
const ref = updateClientStorageForOrgRef(updateClientStorageForOrgVars);
// Variables can be defined inline as well.
const ref = updateClientStorageForOrgRef({ orgId: ..., clientId: ..., productIndex: ..., name: ..., productType: ..., quantity: ..., quantityMin: ..., quantityMax: ..., qrCode: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = updateClientStorageForOrgRef(dataConnect, updateClientStorageForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.clientStorage_update);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.clientStorage_update);
});
```

## DeleteClientStorageForOrg
You can execute the `DeleteClientStorageForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
deleteClientStorageForOrg(vars: DeleteClientStorageForOrgVariables): MutationPromise<DeleteClientStorageForOrgData, DeleteClientStorageForOrgVariables>;

interface DeleteClientStorageForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: DeleteClientStorageForOrgVariables): MutationRef<DeleteClientStorageForOrgData, DeleteClientStorageForOrgVariables>;
}
export const deleteClientStorageForOrgRef: DeleteClientStorageForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
deleteClientStorageForOrg(dc: DataConnect, vars: DeleteClientStorageForOrgVariables): MutationPromise<DeleteClientStorageForOrgData, DeleteClientStorageForOrgVariables>;

interface DeleteClientStorageForOrgRef {
  ...
  (dc: DataConnect, vars: DeleteClientStorageForOrgVariables): MutationRef<DeleteClientStorageForOrgData, DeleteClientStorageForOrgVariables>;
}
export const deleteClientStorageForOrgRef: DeleteClientStorageForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the deleteClientStorageForOrgRef:
```typescript
const name = deleteClientStorageForOrgRef.operationName;
console.log(name);
```

### Variables
The `DeleteClientStorageForOrg` mutation requires an argument of type `DeleteClientStorageForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface DeleteClientStorageForOrgVariables {
  orgId: string;
  clientId: string;
  productIndex: string;
}
```
### Return Type
Recall that executing the `DeleteClientStorageForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `DeleteClientStorageForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface DeleteClientStorageForOrgData {
  clientStorage_delete?: ClientStorage_Key | null;
}
```
### Using `DeleteClientStorageForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, deleteClientStorageForOrg, DeleteClientStorageForOrgVariables } from '@dataconnect/generated';

// The `DeleteClientStorageForOrg` mutation requires an argument of type `DeleteClientStorageForOrgVariables`:
const deleteClientStorageForOrgVars: DeleteClientStorageForOrgVariables = {
  orgId: ..., 
  clientId: ..., 
  productIndex: ..., 
};

// Call the `deleteClientStorageForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await deleteClientStorageForOrg(deleteClientStorageForOrgVars);
// Variables can be defined inline as well.
const { data } = await deleteClientStorageForOrg({ orgId: ..., clientId: ..., productIndex: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await deleteClientStorageForOrg(dataConnect, deleteClientStorageForOrgVars);

console.log(data.clientStorage_delete);

// Or, you can use the `Promise` API.
deleteClientStorageForOrg(deleteClientStorageForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.clientStorage_delete);
});
```

### Using `DeleteClientStorageForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, deleteClientStorageForOrgRef, DeleteClientStorageForOrgVariables } from '@dataconnect/generated';

// The `DeleteClientStorageForOrg` mutation requires an argument of type `DeleteClientStorageForOrgVariables`:
const deleteClientStorageForOrgVars: DeleteClientStorageForOrgVariables = {
  orgId: ..., 
  clientId: ..., 
  productIndex: ..., 
};

// Call the `deleteClientStorageForOrgRef()` function to get a reference to the mutation.
const ref = deleteClientStorageForOrgRef(deleteClientStorageForOrgVars);
// Variables can be defined inline as well.
const ref = deleteClientStorageForOrgRef({ orgId: ..., clientId: ..., productIndex: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = deleteClientStorageForOrgRef(dataConnect, deleteClientStorageForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.clientStorage_delete);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.clientStorage_delete);
});
```

## StartWorkdayPause
You can execute the `StartWorkdayPause` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
startWorkdayPause(vars: StartWorkdayPauseVariables): MutationPromise<StartWorkdayPauseData, StartWorkdayPauseVariables>;

interface StartWorkdayPauseRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: StartWorkdayPauseVariables): MutationRef<StartWorkdayPauseData, StartWorkdayPauseVariables>;
}
export const startWorkdayPauseRef: StartWorkdayPauseRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
startWorkdayPause(dc: DataConnect, vars: StartWorkdayPauseVariables): MutationPromise<StartWorkdayPauseData, StartWorkdayPauseVariables>;

interface StartWorkdayPauseRef {
  ...
  (dc: DataConnect, vars: StartWorkdayPauseVariables): MutationRef<StartWorkdayPauseData, StartWorkdayPauseVariables>;
}
export const startWorkdayPauseRef: StartWorkdayPauseRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the startWorkdayPauseRef:
```typescript
const name = startWorkdayPauseRef.operationName;
console.log(name);
```

### Variables
The `StartWorkdayPause` mutation requires an argument of type `StartWorkdayPauseVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface StartWorkdayPauseVariables {
  orgId: string;
  pauseId: string;
  workdayId: string;
  workerLogin: string;
  workerName?: string | null;
  startAt?: TimestampString | null;
  stopAt?: TimestampString | null;
  durationSec?: number | null;
  status?: string | null;
  pauseEventId?: string | null;
  deviceId?: string | null;
}
```
### Return Type
Recall that executing the `StartWorkdayPause` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `StartWorkdayPauseData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface StartWorkdayPauseData {
  workdayPause_insert: WorkdayPause_Key;
  workday_update?: Workday_Key | null;
}
```
### Using `StartWorkdayPause`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, startWorkdayPause, StartWorkdayPauseVariables } from '@dataconnect/generated';

// The `StartWorkdayPause` mutation requires an argument of type `StartWorkdayPauseVariables`:
const startWorkdayPauseVars: StartWorkdayPauseVariables = {
  orgId: ..., 
  pauseId: ..., 
  workdayId: ..., 
  workerLogin: ..., 
  workerName: ..., // optional
  startAt: ..., // optional
  stopAt: ..., // optional
  durationSec: ..., // optional
  status: ..., // optional
  pauseEventId: ..., // optional
  deviceId: ..., // optional
};

// Call the `startWorkdayPause()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await startWorkdayPause(startWorkdayPauseVars);
// Variables can be defined inline as well.
const { data } = await startWorkdayPause({ orgId: ..., pauseId: ..., workdayId: ..., workerLogin: ..., workerName: ..., startAt: ..., stopAt: ..., durationSec: ..., status: ..., pauseEventId: ..., deviceId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await startWorkdayPause(dataConnect, startWorkdayPauseVars);

console.log(data.workdayPause_insert);
console.log(data.workday_update);

// Or, you can use the `Promise` API.
startWorkdayPause(startWorkdayPauseVars).then((response) => {
  const data = response.data;
  console.log(data.workdayPause_insert);
  console.log(data.workday_update);
});
```

### Using `StartWorkdayPause`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, startWorkdayPauseRef, StartWorkdayPauseVariables } from '@dataconnect/generated';

// The `StartWorkdayPause` mutation requires an argument of type `StartWorkdayPauseVariables`:
const startWorkdayPauseVars: StartWorkdayPauseVariables = {
  orgId: ..., 
  pauseId: ..., 
  workdayId: ..., 
  workerLogin: ..., 
  workerName: ..., // optional
  startAt: ..., // optional
  stopAt: ..., // optional
  durationSec: ..., // optional
  status: ..., // optional
  pauseEventId: ..., // optional
  deviceId: ..., // optional
};

// Call the `startWorkdayPauseRef()` function to get a reference to the mutation.
const ref = startWorkdayPauseRef(startWorkdayPauseVars);
// Variables can be defined inline as well.
const ref = startWorkdayPauseRef({ orgId: ..., pauseId: ..., workdayId: ..., workerLogin: ..., workerName: ..., startAt: ..., stopAt: ..., durationSec: ..., status: ..., pauseEventId: ..., deviceId: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = startWorkdayPauseRef(dataConnect, startWorkdayPauseVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.workdayPause_insert);
console.log(data.workday_update);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.workdayPause_insert);
  console.log(data.workday_update);
});
```

## StopWorkdayPause
You can execute the `StopWorkdayPause` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
stopWorkdayPause(vars: StopWorkdayPauseVariables): MutationPromise<StopWorkdayPauseData, StopWorkdayPauseVariables>;

interface StopWorkdayPauseRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: StopWorkdayPauseVariables): MutationRef<StopWorkdayPauseData, StopWorkdayPauseVariables>;
}
export const stopWorkdayPauseRef: StopWorkdayPauseRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
stopWorkdayPause(dc: DataConnect, vars: StopWorkdayPauseVariables): MutationPromise<StopWorkdayPauseData, StopWorkdayPauseVariables>;

interface StopWorkdayPauseRef {
  ...
  (dc: DataConnect, vars: StopWorkdayPauseVariables): MutationRef<StopWorkdayPauseData, StopWorkdayPauseVariables>;
}
export const stopWorkdayPauseRef: StopWorkdayPauseRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the stopWorkdayPauseRef:
```typescript
const name = stopWorkdayPauseRef.operationName;
console.log(name);
```

### Variables
The `StopWorkdayPause` mutation requires an argument of type `StopWorkdayPauseVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface StopWorkdayPauseVariables {
  orgId: string;
  pauseId: string;
  workdayId: string;
  workerLogin?: string | null;
  stopAt?: TimestampString | null;
  durationSec?: number | null;
  status?: string | null;
}
```
### Return Type
Recall that executing the `StopWorkdayPause` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `StopWorkdayPauseData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface StopWorkdayPauseData {
  workdayPause_update?: WorkdayPause_Key | null;
  workday_update?: Workday_Key | null;
}
```
### Using `StopWorkdayPause`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, stopWorkdayPause, StopWorkdayPauseVariables } from '@dataconnect/generated';

// The `StopWorkdayPause` mutation requires an argument of type `StopWorkdayPauseVariables`:
const stopWorkdayPauseVars: StopWorkdayPauseVariables = {
  orgId: ..., 
  pauseId: ..., 
  workdayId: ..., 
  workerLogin: ..., // optional
  stopAt: ..., // optional
  durationSec: ..., // optional
  status: ..., // optional
};

// Call the `stopWorkdayPause()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await stopWorkdayPause(stopWorkdayPauseVars);
// Variables can be defined inline as well.
const { data } = await stopWorkdayPause({ orgId: ..., pauseId: ..., workdayId: ..., workerLogin: ..., stopAt: ..., durationSec: ..., status: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await stopWorkdayPause(dataConnect, stopWorkdayPauseVars);

console.log(data.workdayPause_update);
console.log(data.workday_update);

// Or, you can use the `Promise` API.
stopWorkdayPause(stopWorkdayPauseVars).then((response) => {
  const data = response.data;
  console.log(data.workdayPause_update);
  console.log(data.workday_update);
});
```

### Using `StopWorkdayPause`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, stopWorkdayPauseRef, StopWorkdayPauseVariables } from '@dataconnect/generated';

// The `StopWorkdayPause` mutation requires an argument of type `StopWorkdayPauseVariables`:
const stopWorkdayPauseVars: StopWorkdayPauseVariables = {
  orgId: ..., 
  pauseId: ..., 
  workdayId: ..., 
  workerLogin: ..., // optional
  stopAt: ..., // optional
  durationSec: ..., // optional
  status: ..., // optional
};

// Call the `stopWorkdayPauseRef()` function to get a reference to the mutation.
const ref = stopWorkdayPauseRef(stopWorkdayPauseVars);
// Variables can be defined inline as well.
const ref = stopWorkdayPauseRef({ orgId: ..., pauseId: ..., workdayId: ..., workerLogin: ..., stopAt: ..., durationSec: ..., status: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = stopWorkdayPauseRef(dataConnect, stopWorkdayPauseVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.workdayPause_update);
console.log(data.workday_update);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.workdayPause_update);
  console.log(data.workday_update);
});
```

