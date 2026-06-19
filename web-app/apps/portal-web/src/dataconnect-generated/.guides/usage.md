# Basic Usage

Always prioritize using a supported framework over using the generated SDK
directly. Supported frameworks simplify the developer experience and help ensure
best practices are followed.




### React
For each operation, there is a wrapper hook that can be used to call the operation.

Here are all of the hooks that get generated:
```ts
import { useInsertWorkerForOrg, useInsertWorkerWithMembershipForOrg, useUpdateWorkerForOrg, useUpdateWorkerProfileForOrg, useRenameWorkerForOrg, useDeleteWorkerProfileForOrg, useUpsertWorkerCredentialForOrg, useUpsertOrgUiStyleForOrg, useDeleteOrgUiStyleForOrg, useUpsertMyUiStylePreference } from '@dataconnect/generated/react';
// The types of these hooks are available in react/index.d.ts

const { data, isPending, isSuccess, isError, error } = useInsertWorkerForOrg(insertWorkerForOrgVars);

const { data, isPending, isSuccess, isError, error } = useInsertWorkerWithMembershipForOrg(insertWorkerWithMembershipForOrgVars);

const { data, isPending, isSuccess, isError, error } = useUpdateWorkerForOrg(updateWorkerForOrgVars);

const { data, isPending, isSuccess, isError, error } = useUpdateWorkerProfileForOrg(updateWorkerProfileForOrgVars);

const { data, isPending, isSuccess, isError, error } = useRenameWorkerForOrg(renameWorkerForOrgVars);

const { data, isPending, isSuccess, isError, error } = useDeleteWorkerProfileForOrg(deleteWorkerProfileForOrgVars);

const { data, isPending, isSuccess, isError, error } = useUpsertWorkerCredentialForOrg(upsertWorkerCredentialForOrgVars);

const { data, isPending, isSuccess, isError, error } = useUpsertOrgUiStyleForOrg(upsertOrgUiStyleForOrgVars);

const { data, isPending, isSuccess, isError, error } = useDeleteOrgUiStyleForOrg(deleteOrgUiStyleForOrgVars);

const { data, isPending, isSuccess, isError, error } = useUpsertMyUiStylePreference(upsertMyUiStylePreferenceVars);

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
import { insertWorkerForOrg, insertWorkerWithMembershipForOrg, updateWorkerForOrg, updateWorkerProfileForOrg, renameWorkerForOrg, deleteWorkerProfileForOrg, upsertWorkerCredentialForOrg, upsertOrgUiStyleForOrg, deleteOrgUiStyleForOrg, upsertMyUiStylePreference } from '@dataconnect/generated';


// Operation InsertWorkerForOrg:  For variables, look at type InsertWorkerForOrgVars in ../index.d.ts
const { data } = await InsertWorkerForOrg(dataConnect, insertWorkerForOrgVars);

// Operation InsertWorkerWithMembershipForOrg:  For variables, look at type InsertWorkerWithMembershipForOrgVars in ../index.d.ts
const { data } = await InsertWorkerWithMembershipForOrg(dataConnect, insertWorkerWithMembershipForOrgVars);

// Operation UpdateWorkerForOrg:  For variables, look at type UpdateWorkerForOrgVars in ../index.d.ts
const { data } = await UpdateWorkerForOrg(dataConnect, updateWorkerForOrgVars);

// Operation UpdateWorkerProfileForOrg:  For variables, look at type UpdateWorkerProfileForOrgVars in ../index.d.ts
const { data } = await UpdateWorkerProfileForOrg(dataConnect, updateWorkerProfileForOrgVars);

// Operation RenameWorkerForOrg:  For variables, look at type RenameWorkerForOrgVars in ../index.d.ts
const { data } = await RenameWorkerForOrg(dataConnect, renameWorkerForOrgVars);

// Operation DeleteWorkerProfileForOrg:  For variables, look at type DeleteWorkerProfileForOrgVars in ../index.d.ts
const { data } = await DeleteWorkerProfileForOrg(dataConnect, deleteWorkerProfileForOrgVars);

// Operation UpsertWorkerCredentialForOrg:  For variables, look at type UpsertWorkerCredentialForOrgVars in ../index.d.ts
const { data } = await UpsertWorkerCredentialForOrg(dataConnect, upsertWorkerCredentialForOrgVars);

// Operation UpsertOrgUiStyleForOrg:  For variables, look at type UpsertOrgUiStyleForOrgVars in ../index.d.ts
const { data } = await UpsertOrgUiStyleForOrg(dataConnect, upsertOrgUiStyleForOrgVars);

// Operation DeleteOrgUiStyleForOrg:  For variables, look at type DeleteOrgUiStyleForOrgVars in ../index.d.ts
const { data } = await DeleteOrgUiStyleForOrg(dataConnect, deleteOrgUiStyleForOrgVars);

// Operation UpsertMyUiStylePreference:  For variables, look at type UpsertMyUiStylePreferenceVars in ../index.d.ts
const { data } = await UpsertMyUiStylePreference(dataConnect, upsertMyUiStylePreferenceVars);


```