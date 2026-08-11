# Basic Usage

Always prioritize using a supported framework over using the generated SDK
directly. Supported frameworks simplify the developer experience and help ensure
best practices are followed.




### React
For each operation, there is a wrapper hook that can be used to call the operation.

Here are all of the hooks that get generated:
```ts
import { useWorkersPageForOrg, useWorkerForOrgByLogin, useClientsPageForOrg, useZonesPageForOrg, useBackupCyclesPageForOrg, useWorkdayPausesPageForOrg } from '@dataconnect/read-guard-generated/react';
// The types of these hooks are available in react/index.d.ts

const { data, isPending, isSuccess, isError, error } = useWorkersPageForOrg(workersPageForOrgVars);

const { data, isPending, isSuccess, isError, error } = useWorkerForOrgByLogin(workerForOrgByLoginVars);

const { data, isPending, isSuccess, isError, error } = useClientsPageForOrg(clientsPageForOrgVars);

const { data, isPending, isSuccess, isError, error } = useZonesPageForOrg(zonesPageForOrgVars);

const { data, isPending, isSuccess, isError, error } = useBackupCyclesPageForOrg(backupCyclesPageForOrgVars);

const { data, isPending, isSuccess, isError, error } = useWorkdayPausesPageForOrg(workdayPausesPageForOrgVars);

```

Here's an example from a different generated SDK:

```ts
import { useListAllMovies } from '@dataconnect/generated/react';

function MyComponent() {
  const { isLoading, data, error } = useListAllMovies();
  if(isLoading) {
    return <div>Loading...</div>
  }
  if(error) {
    return <div> An Error Occurred: {error} </div>
  }
}

// App.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MyComponent from './my-component';

function App() {
  const queryClient = new QueryClient();
  return <QueryClientProvider client={queryClient}>
    <MyComponent />
  </QueryClientProvider>
}
```



## Advanced Usage
If a user is not using a supported framework, they can use the generated SDK directly.

Here's an example of how to use it with the first 5 operations:

```js
import { workersPageForOrg, workerForOrgByLogin, clientsPageForOrg, zonesPageForOrg, backupCyclesPageForOrg, workdayPausesPageForOrg } from '@dataconnect/read-guard-generated';


// Operation WorkersPageForOrg:  For variables, look at type WorkersPageForOrgVars in ../index.d.ts
const { data } = await WorkersPageForOrg(dataConnect, workersPageForOrgVars);

// Operation WorkerForOrgByLogin:  For variables, look at type WorkerForOrgByLoginVars in ../index.d.ts
const { data } = await WorkerForOrgByLogin(dataConnect, workerForOrgByLoginVars);

// Operation ClientsPageForOrg:  For variables, look at type ClientsPageForOrgVars in ../index.d.ts
const { data } = await ClientsPageForOrg(dataConnect, clientsPageForOrgVars);

// Operation ZonesPageForOrg:  For variables, look at type ZonesPageForOrgVars in ../index.d.ts
const { data } = await ZonesPageForOrg(dataConnect, zonesPageForOrgVars);

// Operation BackupCyclesPageForOrg:  For variables, look at type BackupCyclesPageForOrgVars in ../index.d.ts
const { data } = await BackupCyclesPageForOrg(dataConnect, backupCyclesPageForOrgVars);

// Operation WorkdayPausesPageForOrg:  For variables, look at type WorkdayPausesPageForOrgVars in ../index.d.ts
const { data } = await WorkdayPausesPageForOrg(dataConnect, workdayPausesPageForOrgVars);


```