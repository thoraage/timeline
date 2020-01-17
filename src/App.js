import React, {Component} from 'react';

import * as d3 from 'd3';
// noinspection ES6UnusedImports
import * as d3_narrative_charts from 'd3-narrative-charts';
import './App.css';

function capitalize(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
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

function transformCellsToScene(cells) {
    let cell = cells.filter(cell => cell.gs$cell.col === "2");
    return {
        characters:
            cell.flatMap(cell => cell.gs$cell.inputValue.split(","))
                .map(entry => {
                    return getCharacterObjectForCharacterName(entry.trim());
                }),
        description:
            cells.filter(cell => cell.gs$cell.col === "3")
                .map(cell => cell.gs$cell.inputValue)[0],
        date:
            cells.filter(cell => cell.gs$cell.col === "1")
                .map(cell => cell.gs$cell.inputValue)[0]
    };
}

function transformSheetToScenes(sheet) {
    let cells = sheet.feed.entry;
    return Object.values(cells.concat({}).reduceRight(groupRows)).map(transformCellsToScene).filter(event => event.date);
}

function doit(ref, scenes2) {
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
            .append('rect')
            .attr('width', sceneWidth)
            .attr('height', function(d){
                return d.height;
            })
            .attr('y', 0)
            .attr('x', 0)
            .attr('rx', 3)
            .attr('ry', 3)
            .on('mouseover', tull)
            .on('mouseout', (d, i) => {
                console.log("out");
                d3.select(this).attr('class', 'scene');
            });

        function tull(d, i) {
            d3.select(this).attr('class', 'selected-scene');
            d3.select('.scene-description').text(d.description);
            d3.select('.scene-date').text(convertUSDataToLocal(d.date));
            // d3.select(this).html(d.description)
            //     .style("left", '0' + "px")
            //     .style("top", '0' + "px");
            // svg.append("text").attr({
            //     id: "t" + d.x + "-" + d.y + "-" + i,  // Create an id for text so we can select it later for removing on mouseout
            //     x: function() { return d.x; },
            //     y: function() { return d.y; }
            // }).text(() => d.description);
            console.log(d);
        }

        // Tooltip
        // d3.select('body')
        //     .append('div')
        //     .attr('id', 'tooltip');

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
            .attr('r', function(){
                return 2;
            })
            .attr('class', function(d){
                return 'appearance ' + d.character.affiliation;
            });

        // Draw links
        svg.selectAll('.link').data(narrative.links()).enter()
            .append('path')
            .attr('class', function(d) {
                return 'link ' + d.character.affiliation.toLowerCase();
            })
            .attr('d', narrative.link());

        // Draw intro nodes
        svg.selectAll('.intro').data(narrative.introductions())
            .enter().call(function(s){
            var g, text;

            g = s.append('g').attr('class', 'intro');

            g.append('circle')
                .attr('y', -4)
                .attr('x', -4)
                .attr('r', 4);

            text = g.append('g').attr('class','text');

            // Apppend two actual 'text' nodes to fake an 'outside' outline.
            text.append('text');
            text.append('text').attr('class', 'color');

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
                .text(function(d){ return d.character.name; });

            g.select('.color')
                .attr('class', function(d){
                    return 'color ' + d.character.affiliation;
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
            <div ref="timeline">&nbsp;</div>
            <div>
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

    makeScenes(objects) {
        return undefined;
    }
}

export default App;
