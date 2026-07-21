# Basic Usage

Always prioritize using a supported framework over using the generated SDK
directly. Supported frameworks simplify the developer experience and help ensure
best practices are followed.




### React
For each operation, there is a wrapper hook that can be used to call the operation.

Here are all of the hooks that get generated:
```ts
import { useUpsertOrgUiStyleForOrg, useDeleteOrgUiStyleForOrg, useUpsertMyUiStylePreference, useDeleteMyUiStylePreference, useUpsertUserUiStylePreferenceForOrg, useDeleteUserUiStylePreferenceForOrg, useInsertClientForOrg, useUpdateClientForOrg, useDeleteClientForOrg, useInsertIndividualJobForOrg } from '@dataconnect/generated/react';
// The types of these hooks are available in react/index.d.ts

const { data, isPending, isSuccess, isError, error } = useUpsertOrgUiStyleForOrg(upsertOrgUiStyleForOrgVars);

const { data, isPending, isSuccess, isError, error } = useDeleteOrgUiStyleForOrg(deleteOrgUiStyleForOrgVars);

const { data, isPending, isSuccess, isError, error } = useUpsertMyUiStylePreference(upsertMyUiStylePreferenceVars);

const { data, isPending, isSuccess, isError, error } = useDeleteMyUiStylePreference(deleteMyUiStylePreferenceVars);

const { data, isPending, isSuccess, isError, error } = useUpsertUserUiStylePreferenceForOrg(upsertUserUiStylePreferenceForOrgVars);

const { data, isPending, isSuccess, isError, error } = useDeleteUserUiStylePreferenceForOrg(deleteUserUiStylePreferenceForOrgVars);

const { data, isPending, isSuccess, isError, error } = useInsertClientForOrg(insertClientForOrgVars);

const { data, isPending, isSuccess, isError, error } = useUpdateClientForOrg(updateClientForOrgVars);

const { data, isPending, isSuccess, isError, error } = useDeleteClientForOrg(deleteClientForOrgVars);

const { data, isPending, isSuccess, isError, error } = useInsertIndividualJobForOrg(insertIndividualJobForOrgVars);

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
import { upsertOrgUiStyleForOrg, deleteOrgUiStyleForOrg, upsertMyUiStylePreference, deleteMyUiStylePreference, upsertUserUiStylePreferenceForOrg, deleteUserUiStylePreferenceForOrg, insertClientForOrg, updateClientForOrg, deleteClientForOrg, insertIndividualJobForOrg } from '@dataconnect/generated';


// Operation UpsertOrgUiStyleForOrg:  For variables, look at type UpsertOrgUiStyleForOrgVars in ../index.d.ts
const { data } = await UpsertOrgUiStyleForOrg(dataConnect, upsertOrgUiStyleForOrgVars);

// Operation DeleteOrgUiStyleForOrg:  For variables, look at type DeleteOrgUiStyleForOrgVars in ../index.d.ts
const { data } = await DeleteOrgUiStyleForOrg(dataConnect, deleteOrgUiStyleForOrgVars);

// Operation UpsertMyUiStylePreference:  For variables, look at type UpsertMyUiStylePreferenceVars in ../index.d.ts
const { data } = await UpsertMyUiStylePreference(dataConnect, upsertMyUiStylePreferenceVars);

// Operation DeleteMyUiStylePreference:  For variables, look at type DeleteMyUiStylePreferenceVars in ../index.d.ts
const { data } = await DeleteMyUiStylePreference(dataConnect, deleteMyUiStylePreferenceVars);

// Operation UpsertUserUiStylePreferenceForOrg:  For variables, look at type UpsertUserUiStylePreferenceForOrgVars in ../index.d.ts
const { data } = await UpsertUserUiStylePreferenceForOrg(dataConnect, upsertUserUiStylePreferenceForOrgVars);

// Operation DeleteUserUiStylePreferenceForOrg:  For variables, look at type DeleteUserUiStylePreferenceForOrgVars in ../index.d.ts
const { data } = await DeleteUserUiStylePreferenceForOrg(dataConnect, deleteUserUiStylePreferenceForOrgVars);

// Operation InsertClientForOrg:  For variables, look at type InsertClientForOrgVars in ../index.d.ts
const { data } = await InsertClientForOrg(dataConnect, insertClientForOrgVars);

// Operation UpdateClientForOrg:  For variables, look at type UpdateClientForOrgVars in ../index.d.ts
const { data } = await UpdateClientForOrg(dataConnect, updateClientForOrgVars);

// Operation DeleteClientForOrg:  For variables, look at type DeleteClientForOrgVars in ../index.d.ts
const { data } = await DeleteClientForOrg(dataConnect, deleteClientForOrgVars);

// Operation InsertIndividualJobForOrg:  For variables, look at type InsertIndividualJobForOrgVars in ../index.d.ts
const { data } = await InsertIndividualJobForOrg(dataConnect, insertIndividualJobForOrgVars);


```