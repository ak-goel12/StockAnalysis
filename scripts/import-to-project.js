const fs = require("fs");
const { graphql } = require("@octokit/graphql");

(async () => {
  try {
    const jsonData = JSON.parse(fs.readFileSync("learning-plan.json", "utf8"));

    const graphqlWithAuth = graphql.defaults({
      headers: {
        authorization: `bearer ${process.env.GH_PAT}`,
      },
    });

    const repositoryId = process.env.REPO_ID; // Repository ID
    const projectId = process.env.PROJECT_ID; // Project V2 ID

    // 1️⃣ Fetch all project fields with proper inline fragments
    const fieldsResult = await graphqlWithAuth(
      `
      query($projectId: ID!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            fields(first: 50) {
              nodes {
                __typename
                ... on ProjectV2SingleSelectField {
                  id
                  name
                  settings
                }
                ... on ProjectV2TextField {
                  id
                  name
                }
                ... on ProjectV2IterationField {
                  id
                  name
                }
                ... on ProjectV2DateField {
                  id
                  name
                }
                ... on ProjectV2AssigneeField {
                  id
                  name
                }
              }
            }
          }
        }
      }
      `,
      { projectId }
    );

    const projectFields = fieldsResult.node.fields.nodes;
    // Pick the Status field (SingleSelect) dynamically
    const statusField = projectFields.find(
      f => f.__typename === "ProjectV2SingleSelectField" && f.name.toLowerCase() === "status"
    );

    if (!statusField) {
      console.warn("⚠️ Status field not found. Status values will not be set.");
    }

    for (const task of jsonData?.items) {
      console.log(`Creating issue for task: ${task.title}`);

      // 2️⃣ Create the issue
      const createIssueResult = await graphqlWithAuth(
        `
        mutation($repositoryId: ID!, $title: String!, $body: String) {
          createIssue(input: { repositoryId: $repositoryId, title: $title, body: $body }) {
            issue { id }
          }
        }
        `,
        {
          repositoryId,
          title: task.title,
          body: task.description || "",
        }
      );

      const issueId = createIssueResult.createIssue.issue.id;
      console.log(`Issue created: ${issueId}`);

      // 3️⃣ Add issue to Project V2
      const addToProjectResult = await graphqlWithAuth(
        `
        mutation($projectId: ID!, $contentId: ID!) {
          addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
            item { id }
          }
        }
        `,
        { projectId, contentId: issueId }
      );

      const projectItemId = addToProjectResult.addProjectV2ItemById.item.id;
      console.log(`Task added to project: ${projectItemId}`);

      // 4️⃣ Set Status field if exists
      if (statusField && task.status) {
        await graphqlWithAuth(
          `
          mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: String!) {
            updateProjectV2ItemFieldValue(input: {
              projectId: $projectId,
              itemId: $itemId,
              fieldId: $fieldId,
              value: $value
            }) {
              projectV2Item { id }
            }
          }
          `,
          {
            projectId,
            itemId: projectItemId,
            fieldId: statusField.id,
            value: task.status,
          }
        );
        console.log(`Status set to: ${task.status}`);
      }
    }

    console.log("✅ All tasks imported successfully!");
  } catch (error) {
    console.error("❌ Error importing tasks:", error);
    process.exit(1);
  }
})();
