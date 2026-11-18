<script setup lang="ts">
import { Table, TableCell, TableHead } from '@proj-airi/ui'

const rows = [
  { item: 'Standard pack', status: 'Paid', amount: 'USD 10.00' },
  { item: 'Small pack', status: 'Paid', amount: 'USD 5.00' },
]
</script>

<template>
  <Story title="Table" group="misc">
    <Variant id="framed" title="Horizontal scrolling">
      <div :class="['max-w-sm p-4']">
        <Table aria-label="Purchases" :class="['min-w-96']">
          <template #header>
            <tr>
              <TableHead>Item</TableHead>
              <TableHead>Status</TableHead>
              <TableHead align="right">
                Amount
              </TableHead>
            </tr>
          </template>

          <tr v-for="row in rows" :key="row.item">
            <TableCell>{{ row.item }}</TableCell>
            <TableCell>{{ row.status }}</TableCell>
            <TableCell align="right" :class="['tabular-nums']">
              {{ row.amount }}
            </TableCell>
          </tr>
        </Table>
      </div>
    </Variant>
  </Story>
</template>
