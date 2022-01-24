const { URL } = require('url');
const Apify = require('apify');

const { log, requestAsBrowser } = Apify.utils;

const getLatestUrl = (html) => {
    try {
        const latestPath = html.split(`.csv">Latest`)[0].split(`href="`).reverse()[0];
        const latestUrl = new URL(latestPath, 'https://developers.google.com').href;
        return `${latestUrl}.csv`;
    } catch (error) {
        throw new Error(`Could not get latest URL.`);
    }
};

function csvToJson(csv) {
    const rows = csv.split('\n');
    const headers = rows[0].split(',').map((header) => header.replace(/^"|"$/g, ''));
    const dataset = [];

    for (const row of rows.slice(1)) {
        const cells = row.split(',').map((cell) => cell.replace(/^"|"$/g, ''));
        const item = {};
        for (let index = 0; index < headers.length; index++) {
            item[headers[index]] = cells[index];
        }
        dataset.push(item);
    }

    return dataset;
}

const getLatestTargets = async (url) => {
    const { body: csv } = await requestAsBrowser({ url });
    const json = csvToJson(csv);
    return { csv, json };
};

Apify.main(async () => {
    const SOURCE_URL = 'https://developers.google.com/adwords/api/docs/appendix/geotargeting?hl=en';

    const requestList = new Apify.RequestList({
        sources: [
            { url: SOURCE_URL },
        ],
    });

    await requestList.initialize();

    const crawler = new Apify.BasicCrawler({
        requestList,
        maxRequestRetries: 3,

        handleRequestFunction: async ({ request }) => {
            const { body } = await Apify.utils.requestAsBrowser({ url: request.url });
            const latestUrl = getLatestUrl(body);
            log.info('Latest url:', { latestUrl });

            const { csv, json } = await getLatestTargets(latestUrl);

            const store = await Apify.openKeyValueStore('google-locations');

            await store.setValue('latest_json', JSON.stringify(json, null, 2), { contentType: 'application/json' });
            await store.setValue('latest_csv', csv, { contentType: 'text/csv' });
        },
    });

    await crawler.run();

    log.debug('Crawler finished.');
});
