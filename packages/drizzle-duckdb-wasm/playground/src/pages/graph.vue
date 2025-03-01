<script setup lang="ts">
import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3'
import type { DuckDBWasmDrizzleDatabase } from '../../../src'

import * as d3 from 'd3'
// import { eq, inArray } from 'drizzle-orm'
import { onMounted, onUnmounted, ref, watch } from 'vue'

import { drizzle } from '../../../src'
import { buildDSN } from '../../../src/dsn'
import * as schema from '../../db/schema'
import { edgeGroups, edgeOwners, edgePets, edgeUsers, nodeGroups, nodePets, nodeUsers } from '../../db/schema'
import migration1 from '../../drizzle/0001_parched_silver_centurion.sql?raw'

const db = ref<DuckDBWasmDrizzleDatabase<typeof schema>>()
const results = ref<Record<string, unknown>[]>()
// const schemaResults = ref<Record<string, unknown>[]>()
const isMigrated = ref(false)

interface Node extends SimulationNodeDatum {
  id: string
  name: string
  type: string
}

const graphData = ref<{ nodes: Node[], links: (SimulationLinkDatum<Node> & { type: string })[] }>({ nodes: [], links: [] })
const queryResult = ref(null)
const queryType = ref('simple') // 'simple', 'recursive', 'path'
const selectedStartNode = ref(null)
const selectedEndNode = ref(null)

async function connect() {
  isMigrated.value = false
  db.value = drizzle(buildDSN({
    scheme: 'duckdb-wasm:',
    bundles: 'import-url',
    logger: true,
  }), { schema })

  await db.value?.execute('INSTALL vss;')
  await db.value?.execute('LOAD vss;')
}

// Manual multi-level traversal: group -> users -> pets
// async function getPetsInGroup(groupId: string) {
//   // First get all users in the group
//   const groupUsers = await db.value.select({ id: nodeUsers.id })
//     .from(nodeUsers)
//     .innerJoin(edgeGroups, eq(edgeGroups.target, nodeUsers.id))
//     .where(eq(edgeGroups.source, groupId))

//   // Then get all pets owned by these users
//   const userIds = groupUsers.map(u => u.id)

//   return await db.value.select({ pet: nodePets })
//     .from(nodePets)
//     .innerJoin(edgePets, eq(edgePets.target, nodePets.id))
//     .where(inArray(edgePets.source, userIds))
// }

async function migrate() {
  await db.value?.execute(migration1)

  const group1 = await db.value?.insert(nodeGroups).values({ id: crypto.randomUUID().replace(/-/g, ''), name: 'Group 1' }).returning()
  const group2 = await db.value?.insert(nodeGroups).values({ id: crypto.randomUUID().replace(/-/g, ''), name: 'Group 2' }).returning()
  const user1 = await db.value?.insert(nodeUsers).values({ id: crypto.randomUUID().replace(/-/g, ''), name: 'User 1' }).returning()
  const user2 = await db.value?.insert(nodeUsers).values({ id: crypto.randomUUID().replace(/-/g, ''), name: 'User 2' }).returning()
  const user3 = await db.value?.insert(nodeUsers).values({ id: crypto.randomUUID().replace(/-/g, ''), name: 'User 3' }).returning()
  const user4 = await db.value?.insert(nodeUsers).values({ id: crypto.randomUUID().replace(/-/g, ''), name: 'User 4' }).returning()
  const pet1 = await db.value?.insert(nodePets).values({ id: crypto.randomUUID().replace(/-/g, ''), name: 'Pet 1' }).returning()
  const pet2 = await db.value?.insert(nodePets).values({ id: crypto.randomUUID().replace(/-/g, ''), name: 'Pet 2' }).returning()

  // Insert edges
  // User to Group edges (One to M)
  await db.value?.insert(edgeGroups).values({ id: crypto.randomUUID().replace(/-/g, ''), source: group1[0].id, target: user1[0].id }).returning()
  await db.value?.insert(edgeGroups).values({ id: crypto.randomUUID().replace(/-/g, ''), source: group1[0].id, target: user2[0].id }).returning()
  await db.value?.insert(edgeGroups).values({ id: crypto.randomUUID().replace(/-/g, ''), source: group2[0].id, target: user3[0].id }).returning()
  // Group to User edges (M to M)
  await db.value?.insert(edgeUsers).values({ id: crypto.randomUUID().replace(/-/g, ''), source: user1[0].id, target: group1[0].id }).returning()
  await db.value?.insert(edgeUsers).values({ id: crypto.randomUUID().replace(/-/g, ''), source: user2[0].id, target: group2[0].id }).returning()
  await db.value?.insert(edgeUsers).values({ id: crypto.randomUUID().replace(/-/g, ''), source: user3[0].id, target: group2[0].id }).returning()
  // User to Pet edges (One to M)
  await db.value?.insert(edgePets).values({ id: crypto.randomUUID().replace(/-/g, ''), source: user1[0].id, target: pet1[0].id }).returning()
  await db.value?.insert(edgePets).values({ id: crypto.randomUUID().replace(/-/g, ''), source: user2[0].id, target: pet2[0].id }).returning()
  // Pet to User edges (M to One)
  await db.value?.insert(edgeOwners).values({ id: crypto.randomUUID().replace(/-/g, ''), source: pet1[0].id, target: user1[0].id }).returning()
  await db.value?.insert(edgeOwners).values({ id: crypto.randomUUID().replace(/-/g, ''), source: pet2[0].id, target: user2[0].id }).returning()
  // // Create a more complex relationship - user4 has both pets
  await db.value?.insert(edgePets).values({ id: crypto.randomUUID().replace(/-/g, ''), source: user4[0].id, target: pet1[0].id }).returning()
  await db.value?.insert(edgePets).values({ id: crypto.randomUUID().replace(/-/g, ''), source: user4[0].id, target: pet2[0].id }).returning()

  // First, let's check if our data was inserted correctly
  // console.log('Users:', await db.value?.select().from(nodeUsers))
  // console.log('Groups:', await db.value?.select().from(nodeGroups))
  // console.log('User-Group edges:', await db.value?.select().from(edgeGroups))
  // console.log('Group-User edges:', await db.value?.select().from(edgeGroups))

  //   console.log(await db.value?.execute(`
  // WITH RECURSIVE user_network AS (
  //   -- Base case: start with the given user
  //   SELECT id, name, 0 AS depth
  //   FROM node_users
  //   WHERE id = '${user1[0].id}'

  //   UNION ALL

  //   -- Find connections through groups
  //   SELECT nu.id, nu.name, un.depth + 1
  //   FROM user_network un
  //   JOIN edge_users eu ON un.id = eu.source
  //   JOIN node_groups ng ON eu.target = ng.id
  //   JOIN edge_groups eg ON ng.id = eg.source
  //   JOIN node_users nu ON eg.target = nu.id
  //   WHERE un.depth < 3
  // )

  // SELECT id, name, depth
  // FROM user_network
  // ORDER BY depth;`))

  isMigrated.value = true
}

// Fetch all nodes and edges for visualization
async function fetchGraphData() {
  const users = await db.value?.select().from(nodeUsers)
  const groups = await db.value?.select().from(nodeGroups)
  const pets = await db.value?.select().from(nodePets)

  const userEdges = await db.value?.select().from(edgeUsers)
  const groupEdges = await db.value?.select().from(edgeGroups)
  const petEdges = await db.value?.select().from(edgePets)
  const ownerEdges = await db.value?.select().from(edgeOwners)

  // Prepare nodes with different types
  const nodes = [
    ...users.map(u => ({ id: u.id, name: u.name, type: 'user' } satisfies Node)),
    ...groups.map(g => ({ id: g.id, name: g.name, type: 'group' } satisfies Node)),
    ...pets.map(p => ({ id: p.id, name: p.name, type: 'pet' } satisfies Node)),
  ]

  // Prepare links with different types
  const links = [
    ...userEdges.map(e => ({ source: e.source, target: e.target, type: 'user-group' })),
    ...groupEdges.map(e => ({ source: e.source, target: e.target, type: 'group-user' })),
    ...petEdges.map(e => ({ source: e.source, target: e.target, type: 'user-pet' })),
    ...ownerEdges.map(e => ({ source: e.source, target: e.target, type: 'pet-owner' })),
  ]

  graphData.value = { nodes, links }

  // Set default selected nodes for queries
  if (nodes.length > 0) {
    selectedStartNode.value = nodes.find(n => n.type === 'user')?.id
    selectedEndNode.value = nodes.find(n => n.type === 'user' && n.id !== selectedStartNode.value)?.id
  }
}

// Run a simple query to find direct connections
async function runSimpleQuery() {
  if (!selectedStartNode.value)
    return

  const result = await db.value?.execute(`
    -- Find direct connections from the selected node
    SELECT
      n.id, n.name,
      CASE
        WHEN n.id IN (SELECT id FROM node_users) THEN 'user'
        WHEN n.id IN (SELECT id FROM node_groups) THEN 'group'
        WHEN n.id IN (SELECT id FROM node_pets) THEN 'pet'
      END as type,
      e.source, e.target
    FROM (
      -- User to Group
      SELECT eu.source, eu.target, ng.id, ng.name
      FROM edge_users eu
      JOIN node_groups ng ON eu.target = ng.id
      WHERE eu.source = '${selectedStartNode.value}'

      UNION ALL

      -- User to Pet
      SELECT ep.source, ep.target, np.id, np.name
      FROM edge_pets ep
      JOIN node_pets np ON ep.target = np.id
      WHERE ep.source = '${selectedStartNode.value}'

      UNION ALL

      -- Group to User
      SELECT eg.source, eg.target, nu.id, nu.name
      FROM edge_groups eg
      JOIN node_users nu ON eg.target = nu.id
      WHERE eg.source = '${selectedStartNode.value}'

      UNION ALL

      -- Pet to Owner
      SELECT eo.source, eo.target, nu.id, nu.name
      FROM edge_owners eo
      JOIN node_users nu ON eo.target = nu.id
      WHERE eo.source = '${selectedStartNode.value}'
    ) e
    JOIN (
      SELECT id, name FROM node_users
      UNION ALL
      SELECT id, name FROM node_groups
      UNION ALL
      SELECT id, name FROM node_pets
    ) n ON e.id = n.id
  `)

  queryResult.value = result
  highlightQueryResults(result)
}

// Run a recursive query to find paths
async function runRecursiveQuery() {
  if (!selectedStartNode.value)
    return

  const result = await db.value?.execute(`
    WITH RECURSIVE path_search AS (
      -- Base case: start with the given node
      SELECT
        id,
        name,
        CASE
          WHEN id IN (SELECT id FROM node_users) THEN 'user'
          WHEN id IN (SELECT id FROM node_groups) THEN 'group'
          WHEN id IN (SELECT id FROM node_pets) THEN 'pet'
        END as type,
        0 AS depth,
        ARRAY[id] AS path
      FROM (
        SELECT id, name FROM node_users
        UNION ALL
        SELECT id, name FROM node_groups
        UNION ALL
        SELECT id, name FROM node_pets
      ) nodes
      WHERE id = '${selectedStartNode.value}'

      UNION ALL

      -- Recursive case: follow all possible edges
      SELECT
        target_node.id,
        target_node.name,
        CASE
          WHEN target_node.id IN (SELECT id FROM node_users) THEN 'user'
          WHEN target_node.id IN (SELECT id FROM node_groups) THEN 'group'
          WHEN target_node.id IN (SELECT id FROM node_pets) THEN 'pet'
        END as type,
        ps.depth + 1,
        ps.path || ARRAY[target_node.id]
      FROM path_search ps
      JOIN (
        -- All possible edges
        SELECT source, target FROM edge_users
        UNION ALL
        SELECT source, target FROM edge_groups
        UNION ALL
        SELECT source, target FROM edge_pets
        UNION ALL
        SELECT source, target FROM edge_owners
      ) edges ON ps.id = edges.source
      JOIN (
        SELECT id, name FROM node_users
        UNION ALL
        SELECT id, name FROM node_groups
        UNION ALL
        SELECT id, name FROM node_pets
      ) target_node ON edges.target = target_node.id
      WHERE ps.depth < 3
      AND NOT target_node.id = ANY(ps.path) -- Avoid cycles
    )

    SELECT id, name, type, depth, path
    FROM path_search
    WHERE depth > 0 -- Exclude the starting node
    ORDER BY depth, name
  `)

  queryResult.value = result
  highlightQueryResults(result)
}

// Run a path finding query between two nodes
async function runPathQuery() {
  if (!selectedStartNode.value || !selectedEndNode.value)
    return

  const result = await db.value?.execute(`
    WITH RECURSIVE path_search AS (
      -- Base case: start with the given node
      SELECT
        id,
        name,
        CASE
          WHEN id IN (SELECT id FROM node_users) THEN 'user'
          WHEN id IN (SELECT id FROM node_groups) THEN 'group'
          WHEN id IN (SELECT id FROM node_pets) THEN 'pet'
        END as type,
        0 AS depth,
        ARRAY[id] AS path,
        id = '${selectedEndNode.value}' AS found
      FROM (
        SELECT id, name FROM node_users
        UNION ALL
        SELECT id, name FROM node_groups
        UNION ALL
        SELECT id, name FROM node_pets
      ) nodes
      WHERE id = '${selectedStartNode.value}'

      UNION ALL

      -- Recursive case: follow all possible edges
      SELECT
        target_node.id,
        target_node.name,
        CASE
          WHEN target_node.id IN (SELECT id FROM node_users) THEN 'user'
          WHEN target_node.id IN (SELECT id FROM node_groups) THEN 'group'
          WHEN target_node.id IN (SELECT id FROM node_pets) THEN 'pet'
        END as type,
        ps.depth + 1,
        ps.path || ARRAY[target_node.id],
        target_node.id = '${selectedEndNode.value}' AS found
      FROM path_search ps
      JOIN (
        -- All possible edges
        SELECT source, target FROM edge_users
        UNION ALL
        SELECT source, target FROM edge_groups
        UNION ALL
        SELECT source, target FROM edge_pets
        UNION ALL
        SELECT source, target FROM edge_owners
      ) edges ON ps.id = edges.source
      JOIN (
        SELECT id, name FROM node_users
        UNION ALL
        SELECT id, name FROM node_groups
        UNION ALL
        SELECT id, name FROM node_pets
      ) target_node ON edges.target = target_node.id
      WHERE ps.depth < 5
      AND NOT target_node.id = ANY(ps.path) -- Avoid cycles
      AND NOT ps.found -- Stop once we've found the target
    )

    SELECT id, name, type, depth, path
    FROM path_search
    WHERE found = true
    ORDER BY depth
    LIMIT 1
  `)

  queryResult.value = result
  highlightQueryResults(result)
}

// Highlight nodes and edges based on query results
function highlightQueryResults(results) {
  // Reset all highlights
  d3.selectAll('.node').classed('highlighted', false).classed('in-path', false)
  d3.selectAll('.link').classed('highlighted', false).classed('in-path', false)

  if (!results || !results.length)
    return

  // For path queries, highlight the entire path
  if (results[0].path) {
    const pathIds = new Set()
    const pathLinks = new Set()

    results.forEach((row) => {
      if (row.path && row.path.length > 1) {
        // Add all nodes in the path
        row.path.forEach(id => pathIds.add(id))

        // Add all links in the path
        for (let i = 0; i < row.path.length - 1; i++) {
          pathLinks.add(`${row.path[i]}-${row.path[i + 1]}`)
        }
      }
    })

    // Highlight nodes in the path
    d3.selectAll('.node')
      .classed('in-path', (d: { id: string }) => pathIds.has(d.id))

    // Highlight links in the path
    d3.selectAll('.link')
      .classed('in-path', (d: { source: { id: string }, target: { id: string } }) => {
        return pathLinks.has(`${d.source.id}-${d.target.id}`)
          || pathLinks.has(`${d.target.id}-${d.source.id}`)
      })
  }
  // For simple queries, just highlight the direct connections
  else {
    const nodeIds = new Set(results.map(r => r.id))

    // Highlight nodes
    d3.selectAll('.node')
      .classed('highlighted', (d: { id: string }) => nodeIds.has(d.id))

    // Highlight links
    d3.selectAll('.link')
      .classed('highlighted', (d: { source: { id: string }, target: { id: string } }) => {
        return (d.source.id === selectedStartNode.value && nodeIds.has(d.target.id))
          || (d.target.id === selectedStartNode.value && nodeIds.has(d.source.id))
      })
  }
}

// Run the appropriate query based on the selected type
function runQuery() {
  switch (queryType.value) {
    case 'simple':
      runSimpleQuery()
      break
    case 'recursive':
      runRecursiveQuery()
      break
    case 'path':
      runPathQuery()
      break
  }
}

// Create the D3 force-directed graph
function createGraph() {
  const width = 800
  const height = 600

  // Clear previous graph
  d3.select('#graph-container').selectAll('*').remove()

  // Create tooltip div
  const tooltip = d3.select('#graph-container')
    .append('div')
    .attr('class', 'tooltip w-full bg-neutral-100 dark:bg-neutral-800')
    .style('opacity', 0)
    .style('position', 'absolute')
    .style('padding', '8px')
    .style('border-radius', '4px')
    .style('pointer-events', 'none')
    .style('z-index', 10)
    .style('font-size', '12px')
    .style('max-width', '200px')

  const svg = d3.select('#graph-container')
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', [0, 0, width, height])

  // Define arrow markers for links
  svg.append('defs').selectAll('marker').data(['user-group', 'group-user', 'user-pet', 'pet-owner']).join('marker').attr('id', d => `arrow-${d}`).attr('viewBox', '0 -5 10 10').attr('refX', 15).attr('refY', 0).attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto').append('path').attr('fill', (d) => {
    switch (d) {
      case 'user-group': return '#4CAF50'
      case 'group-user': return '#2196F3'
      case 'user-pet': return '#FF9800'
      case 'pet-owner': return '#9C27B0'
      default: return '#999'
    }
  }).attr('d', 'M0,-5L10,0L0,5')

  // Create the simulation
  const simulation = d3.forceSimulation(graphData.value.nodes)
    .force('link', d3.forceLink(graphData.value.links).id(d => ('id' in d ? d.id : d) as string).distance(100))
    .force('charge', d3.forceManyBody().strength(-300))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(40))

  // Create links
  const link = svg.append('g')
    .selectAll('line')
    .data(graphData.value.links)
    .join('line')
    .attr('class', 'link')
    .attr('stroke', (d) => {
      switch (d.type) {
        case 'user-group': return '#4CAF50'
        case 'group-user': return '#2196F3'
        case 'user-pet': return '#FF9800'
        case 'pet-owner': return '#9C27B0'
        default: return '#999'
      }
    })
    .attr('stroke-width', 2)
    .attr('marker-end', d => `url(#arrow-${d.type})`)
    .on('mouseover', function (event, d) {
      // Highlight the link
      d3.select(this).attr('stroke-width', 4)

      // Show tooltip with edge information
      tooltip.transition()
        .duration(100)
        .style('opacity', 0.9)
        .ease()

      let relationshipText = ''
      switch (d.type) {
        case 'user-group':
          relationshipText = 'User belongs to Group'
          break
        case 'group-user':
          relationshipText = 'Group contains User'
          break
        case 'user-pet':
          relationshipText = 'User owns Pet'
          break
        case 'pet-owner':
          relationshipText = 'Pet owned by User'
          break
      }

      // Find source and target node names
      const sourceNode = graphData.value.nodes.find(n => n.id === (d.source as Node).id || n.id === d.source)
      const targetNode = graphData.value.nodes.find(n => n.id === (d.target as Node).id || n.id === d.target)

      tooltip.html(`
        <div class="font-bold">${relationshipText}</div>
        <div>From: ${sourceNode?.name || 'Unknown'}</div>
        <div>To: ${targetNode?.name || 'Unknown'}</div>
      `)
        .style('left', `${event.pageX + 10}px`)
        .style('top', `${event.pageY - 28}px`)
    })
    .on('mouseout', function () {
      // Reset link thickness
      d3.select(this).attr('stroke-width', 2)

      // Hide tooltip
      tooltip.transition()
        .duration(100)
        .style('opacity', 0)
        .ease()
    })

  // Create node groups
  const node = svg.append('g')
    .selectAll('.node')
    .data(graphData.value.nodes)
    .join('g')
    .attr('class', 'node')
    .call(d3.drag<SVGCircleElement, Node>()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended))
    .on('click', (event, d) => {
      // Toggle selection of nodes for queries
      if (event.ctrlKey || event.metaKey) {
        selectedEndNode.value = d.id
      }
      else {
        selectedStartNode.value = d.id
      }
      runQuery()
    })
    .on('mouseover', function (event, d) {
      // Show tooltip with node information
      tooltip.transition()
        .duration(100)
        .style('opacity', 0.9)
        .ease()

      // Show if this is the selected start or end node
      let selectionStatus = ''
      if (d.id === selectedStartNode.value) {
        selectionStatus = '<div class="text-green-400">Start Node</div>'
      }
      else if (d.id === selectedEndNode.value) {
        selectionStatus = '<div class="text-red-400">End Node</div>'
      }

      tooltip.html(`
        <div class="font-bold">${d.name}</div>
        <div class="text-xs dark:text-neutral-300 text-neutral-500">Type: ${d.type}</div>
        <div class="text-xs dark:text-neutral-300 text-neutral-500">ID: ${d.id}</div>
        ${selectionStatus}
      `)
        .style('left', `${event.pageX + 10}px`)
        .style('top', `${event.pageY - 28}px`)

      // Highlight the node
      d3.select(this).select('circle').transition().duration(100).attr('r', 25).ease()
    })
    .on('mouseout', function () {
      // Hide tooltip
      tooltip.transition()
        .duration(100)
        .style('opacity', 0)
        .ease()

      // Reset node size
      d3.select(this).select('circle').transition().duration(100).attr('r', 20).ease()
    })

  // Add circles to nodes
  node.append('circle')
    .attr('r', 20)
    .attr('fill', (d) => {
      switch (d.type) {
        case 'user': return '#E91E63'
        case 'group': return '#3F51B5'
        case 'pet': return '#FFC107'
        default: return '#999'
      }
    })

  // Add small icons or initials inside nodes instead of full text
  node.append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', '.35em')
    .attr('fill', 'white')
    .attr('font-size', '10px')
    .text((d) => {
      switch (d.type) {
        case 'user': return 'U'
        case 'group': return 'G'
        case 'pet': return 'P'
        default: return ''
      }
    })

  // Update positions on each tick
  simulation.on('tick', () => {
    link
      .attr('x1', d => (d.source as SimulationNodeDatum).x)
      .attr('y1', d => (d.source as SimulationNodeDatum).y)
      .attr('x2', d => (d.target as SimulationNodeDatum).x)
      .attr('y2', d => (d.target as SimulationNodeDatum).y)

    node.attr('transform', d => `translate(${d.x},${d.y})`)
  })

  // Drag functions
  function dragstarted(event) {
    if (!event.active)
      simulation.alphaTarget(0.3).restart()
    event.subject.fx = event.subject.x
    event.subject.fy = event.subject.y
  }

  function dragged(event) {
    event.subject.fx = event.x
    event.subject.fy = event.y
  }

  function dragended(event) {
    if (!event.active)
      simulation.alphaTarget(0)
    event.subject.fx = null
    event.subject.fy = null
  }
}

// Watch for changes in graph data and recreate the visualization
watch(graphData, () => {
  if (graphData.value.nodes.length > 0) {
    createGraph()
  }
})

onMounted(async () => {
  await connect()
  await migrate()

  results.value = await db.value?.execute('SHOW TABLES;')
  // const usersResults = await db.value?.select().from(users)
  // schemaResults.value = usersResults
  // console.log(results.value)

  await fetchGraphData()
  isMigrated.value = true
})

onUnmounted(() => {
  db.value?.$client.then(client => client.close())
})
</script>

<template>
  <div class="p-4">
    <div v-if="!isMigrated" class="py-8 text-center">
      <div class="mx-auto h-8 w-8 animate-spin border-4 border-blue-500 border-t-transparent rounded-full" />
      <p class="mt-4">
        Initializing database...
      </p>
    </div>

    <div v-else class="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <!-- Graph Visualization -->
      <div class="rounded-lg p-4 shadow lg:col-span-2">
        <h2 class="mb-2 text-lg font-semibold">
          Visualize
        </h2>
        <div id="graph-container" class="h-[600px] w-full" />
        <div class="mt-4 flex flex-wrap gap-2">
          <div class="flex items-center">
            <div class="mr-2 h-4 w-4 rounded-full bg-[#E91E63]" />
            <span>User</span>
          </div>
          <div class="flex items-center">
            <div class="mr-2 h-4 w-4 rounded-full bg-[#3F51B5]" />
            <span>Group</span>
          </div>
          <div class="flex items-center">
            <div class="mr-2 h-4 w-4 rounded-full bg-[#FFC107]" />
            <span>Pet</span>
          </div>
        </div>
      </div>

      <!-- Controls and Results -->
      <div class="space-y-4">
        <!-- Query Controls -->
        <div class="rounded-lg p-4 shadow">
          <h2 class="mb-2 text-lg font-semibold">
            Query Controls
          </h2>

          <div class="mb-4">
            <label class="mb-1 block text-sm font-medium">Query Type</label>
            <select v-model="queryType" class="w-full border rounded p-2">
              <option value="recursive">
                Recursive (All Paths)
              </option>
              <option value="path">
                Find Path Between Nodes
              </option>
              <option value="simple">
                Direct Connections
              </option>
            </select>
          </div>

          <div class="mb-4">
            <label class="mb-1 block text-sm font-medium">Start Node</label>
            <select v-model="selectedStartNode" class="w-full border rounded p-2">
              <option v-for="node in graphData.nodes" :key="`start-${node.id}`" :value="node.id">
                {{ node.name }} ({{ node.type }})
              </option>
            </select>
          </div>

          <div v-if="queryType === 'path'" class="mb-4">
            <label class="mb-1 block text-sm font-medium">End Node</label>
            <select v-model="selectedEndNode" class="w-full border rounded p-2">
              <option v-for="node in graphData.nodes" :key="`end-${node.id}`" :value="node.id">
                {{ node.name }} ({{ node.type }})
              </option>
            </select>
          </div>

          <button class="w-full rounded bg-blue-100 px-4 py-2 dark:bg-blue-900" @click="runQuery">
            Run Query
          </button>

          <div class="mt-2 text-sm text-neutral-500">
            <p>Click a node to select it as start node.</p>
            <p>Ctrl+Click to select as end node.</p>
          </div>
        </div>

        <!-- Query Results -->
        <div v-if="queryResult" class="rounded-lg p-4 shadow">
          <h2 class="mb-2 text-lg font-semibold">
            Query Results
          </h2>
          <div class="max-h-[300px] overflow-auto">
            <table class="min-w-full">
              <thead mb-2>
                <tr>
                  <th
                    class="border-b px-2 py-1 text-left text-xs text-neutral-500 font-medium tracking-wider uppercase"
                  >
                    Name
                  </th>
                  <th
                    class="border-b px-2 py-1 text-left text-xs text-neutral-500 font-medium tracking-wider uppercase"
                  >
                    Type
                  </th>
                  <th
                    class="border-b px-2 py-1 text-left text-xs text-neutral-500 font-medium tracking-wider uppercase"
                  >
                    Depth
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(row, i) in queryResult" :key="i" class="hover:bg-neutral-50 dark:hover:bg-neutral-800"
                  transition="all duration-250 ease-in-out" of-hidden
                >
                  <td class="whitespace-nowrap px-2 py-1 text-sm" rounded-l-lg>
                    {{ row.name }}
                  </td>
                  <td class="whitespace-nowrap px-2 py-1 text-sm">
                    {{ row.type }}
                  </td>
                  <td class="whitespace-nowrap px-2 py-1 text-sm" rounded-r-lg>
                    {{ row.depth }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.node circle {
  stroke: #fff;
  stroke-width: 2px;
  transition: all 0.2s ease;
}

.node.highlighted circle {
  stroke: #ff0;
  stroke-width: 3px;
}

.node.in-path circle {
  stroke: #ff0;
  stroke-width: 3px;
  filter: drop-shadow(0 0 5px rgba(255, 255, 0, 0.7));
}

.link {
  stroke-opacity: 0.6;
  transition: all 0.2s ease;
}

.link.highlighted {
  stroke-opacity: 1;
  stroke-width: 3px;
}

.link.in-path {
  stroke-opacity: 1;
  stroke-width: 3px;
  filter: drop-shadow(0 0 3px rgba(255, 255, 0, 0.5));
}

.tooltip {
  transition: opacity 0.3s ease;
}
</style>
