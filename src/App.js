import React, {Component} from 'react';

import * as d3 from 'd3';
// noinspection ES6UnusedImports
import * as d3_narrative_charts from 'd3-narrative-charts';
import './App.css';

function capitalize(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

function makeClassName(string) {
    return string.toLowerCase().replace(/[ .]/g, '_');
}

function convertUSDataToLocal(usDateString) {
    let usDateRegex = /(\d+)\/(\d+)\/(\d+)/g;
    let elements = usDateRegex.exec(usDateString);
    if (elements && elements.length === 4) {
        let ms = Date.parse("" + elements[3] + "-" + elements[1] + "-" + elements[2]);
        let dateString = new Date(ms).toLocaleDateString(navigator.language, { dateStyle: 'full' });
        return capitalize(dateString);
    }
    return usDateString;
}

function groupRows(acc, curr) {
    let row = acc[curr.gs$cell.row];
    if (row) {
        row.push(curr);
    } else {
        acc[curr.gs$cell.row] = [curr];
    }
    return acc;
}

let characterMap = {};

function getCharacterObjectForCharacterName(name) {
    var character = characterMap[name];
    if (!character) {
        let id = "c" + Object.values(characterMap).length;
        character = {id: id, name: name, affiliation: "Humans"};
        characterMap[name] = character;
    }
    return character;
}

function pickColumn(cells, columnNumber) {
    return cells.filter(cell => cell.gs$cell.col === columnNumber.toString())
        .map(cell => cell.gs$cell.inputValue)[0];
}

function pickColumnArray(cells, columnNumber) {
    return (pickColumn(cells, columnNumber) || "").split(",").map(entry => getCharacterObjectForCharacterName(entry.trim()));
}

function transformCellsToScene(cells) {
    return {
        characters: pickColumnArray(cells, 2),
            // cells.filt er(cell => cell.gs$cell.col === "2").flatMap(cell => cell.gs$cell.inputValue.split(","))
            //     .map(entry => getCharacterObjectForCharacterName(entry.trim())),
        description: pickColumn(cells, 3),
        date: pickColumn(cells, 1),
        cases: pickColumnArray(cells, 5)
    };
}

function transformSheetToScenes(sheet) {
    let cells = sheet.feed.entry;
    return Object.values(cells.concat({})
        .reduceRight(groupRows))
        .map(transformCellsToScene)
        .filter(event => event.date);
}

function deselectPath(svg, characterName) {
    svg.selectAll('.' + makeClassName(characterName))
        .transition().duration(250)
        .attr('stroke-width', 1)
        .attr('r', 2);
}

function selectPath(svg, characterName) {
    svg.selectAll('.' + makeClassName(characterName))
        .attr('stroke-width', 3)
        .attr('r', 4);
}

function doit(ref, scenes2) {
    var revertSceneFunction = null;

    // Request the data
    d3.json('data.json', function(err, response){

        var svg, scenes, width, height, sceneWidth;

        // Get the data in the format we need to feed to d3.layout.narrative().scenes
        scenes = wrangle(response);

        console.log(scenes);
        scenes2 = transformSheetToScenes(scenes2);
        console.log(scenes2);
        scenes = scenes2;

        // Some defaults
        sceneWidth = 10;
        width = scenes.length * sceneWidth * 4;
        height = 600;

        // The container element (this is the HTML fragment);
        svg = d3.select(ref).append('svg')
            .attr('id', 'narrative-chart')
            .attr('width', width)
            .attr('height', height);

        // Calculate the actual width of every character label.
        scenes.forEach(function(scene){
            scene.characters.forEach(function(character) {
                character.width = svg.append('text')
                    .attr('opacity',0)
                    .attr('class', 'temp')
                    .text(character.name)
                    .node().getComputedTextLength()+10;
            });
        });

        // Remove all the temporary labels.
        svg.selectAll('text.temp').remove();

        // Do the layout
        let narrative = d3.layout.narrative()
            .scenes(scenes)
            .size([width,height])
            .pathSpace(10)
            .groupMargin(10)
            .labelSize([250,15])
            .scenePadding([5,sceneWidth/2,5,sceneWidth/2])
            .labelPosition('left')
            .layout();

        // Get the extent so we can re-size the SVG appropriately.
        svg.attr('height', narrative.extent()[1]);

        // Draw the scenes
        svg.selectAll('.scene').data(narrative.scenes()).enter()
            .append('g')
            .attr('class', 'scene')
            .attr('transform', function(d){
                var x,y;
                x = Math.round(d.x)+0.5;
                y = Math.round(d.y)+0.5;
                return 'translate('+[x,y]+')';
            })
            .on('mouseover', selectScene)
            .append('rect')
            .attr('width', sceneWidth)
            .attr('height', function(d){
                return d.height;
            })
            .attr('y', 0)
            .attr('x', 0)
            .attr('rx', 3)
            .attr('ry', 3);

        function selectScene(scene) {
            console.log(scene);
            if (!revertSceneFunction || revertSceneFunction(scene)) {
                d3.selectAll('.scene-presentation *').transition().duration(100).style('opacity', '0').each('end', () => {
                    d3.select('.scene-description').text(scene.description);
                    d3.select('.scene-date').text(convertUSDataToLocal(scene.date));
                    d3.selectAll('.scene-presentation *').transition().duration(100).style('opacity', '100%');
                });
                d3.select(this).attr('class', 'scene-selected');
                let that = this;
                revertSceneFunction = function(newScene) {
                    if (newScene === scene) {
                        return false;
                    } else {
                        d3.select(that).attr('class', 'scene');
                        scene.characters.forEach(character => deselectPath(svg, character.name));
                        return true;
                    }
                }
            }
            scene.characters.forEach(character => selectPath(svg, character.name));
        }

        // Draw appearances
        svg.selectAll('.scene').selectAll('.appearance').data(function(d){
            return d.appearances;
        }).enter().append('circle')
            .attr('cx', function(d){
                return d.x;
            })
            .attr('cy', function(d){
                return d.y;
            })
            .attr('r', 2)
            .attr('class', function(d){
                return 'appearance character-link ' + d.character.affiliation + " " + makeClassName(d.character.name);
            })
            .on('mouseover', d => selectPath(svg, d.character.name))
            .on('mouseout', d => deselectPath(svg, d.character.name));

        // Draw links
        svg.selectAll('.link').data(narrative.links()).enter()
            .append('path')
            .attr('class', function(d) {
                return 'link ' + makeClassName(d.character.affiliation) + " " + makeClassName(d.character.name);
            })
            .attr('stroke-width', 1)
            .attr('d', narrative.link())
            .on('mouseover', d => selectPath(svg, d.character.name))
            .on('mouseout', d => deselectPath(svg, d.character.name));

        // Draw intro nodes
        svg.selectAll('.intro').data(narrative.introductions())
            .enter().call(function(s){
            var g, text;

            g = s.append('g').attr('class', 'intro');

            g.append('circle')
                .attr('class', 'character-link')
                .attr('y', -4)
                .attr('x', -4)
                .attr('r', 4);

            text = g.append('g').attr('class','text');

            // Apppend two actual 'text' nodes to fake an 'outside' outline.
            text.append('text');
            text.append('text').attr('class', 'intro-text');

            g.attr('transform', function(d){
                var x,y;
                x = Math.round(d.x);
                y = Math.round(d.y);
                return 'translate(' + [x,y] + ')';
            });

            g.selectAll('text')
                .attr('text-anchor', 'end')
                .attr('y', '4px')
                .attr('x', '-8px')
                .text(function(d){ return d.character.name; })
                .on('mouseover', d => selectPath(svg, d.character.name))
                .on('mouseout', d => deselectPath(svg, d.character.name));

            g.select('.color')
                .attr('class', function(d){
                    return 'intro-text ' + makeClassName(d.character.affiliation);
                });

            g.select('rect')
                .attr('class', function(d){
                    return d.character.affiliation;
                });

        });

    });

    function wrangle(data) {

        var charactersMap = {};

        return data.scenes.map(function(scene){
            return {characters: scene.map(function(id){
                    return characterById(id);
                }).filter(function(d) { return (d); })};
        });

        // Helper to get characters by ID from the raw data
        function characterById(id) {
            charactersMap[id] = charactersMap[id] || data.characters.find(function(character){
                return character.id === id;
            });
            return charactersMap[id];
        }

    }
}

class App extends Component {

    async componentDidMount() {
        let objects = await (await fetch("t.json")).json();
        // let names = Array.from(new Set(objects.feed.entry.map(entry => entry.gs$cell)
        //     .filter(entry => entry.col === "2")
        //     .flatMap(entry => entry.inputValue.split(","))
        //     .map(entry => entry.trim()))).sort();
        // console.log(names);
        // // const temperatureData = [8, 5, 13, 9, 12];
        // let svg = d3.select(this.refs.timeline)
        //     .append('svg')
        //     .attr('id', 'narrative-chart')
        //     .attr('width', this.width)
        //     .attr('height', this.height);
        //
        // let scenes = this.makeScenes(objects);
        doit(this.refs.timeline, objects);
            // .selectAll("h2")
            // .data(names)
            // .enter()
            // .append("h2")
            // .text(name => name);
            // .image(name => "entities/" + name + ".png");
    }

    render() {
        return <div>
            <div className="timeline" ref="timeline">&nbsp;</div>
            <div className="scene-presentation">
                <div className="scene-date"/>
                <div className="scene-description"/>
            </div>
        </div>;
    }

    // render() {
    //   d3.select('#timeline').style("background-color", "blue");
    //   return (<div id="timeline"></div>);
    // render(<div ref="myDiv"></div>);
    // return (
    //   <div className="App">
    //     <div className="App-header">
    //       <img src={logo} className="App-logo" alt="logo" />
    //       <h2>Welcome to React</h2>
    //     </div>
    //     <p className="App-intro">
    //       To get started, edit <code>src/App.js</code> and save to reload.
    //     </p>
    //   </div>
    // );
    // }

    // makeScenes(objects) {
    //     return undefined;
    // }
}

export default App;
